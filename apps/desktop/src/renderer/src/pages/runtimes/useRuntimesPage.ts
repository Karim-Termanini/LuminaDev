import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JobSummary, RuntimeStatus } from '@linux-dev-home/shared'
import {
  runtimeIsSystemOnly,
  runtimeSupportsLocalInstall,
} from '@linux-dev-home/shared'
import { assertRuntimeOk } from '../runtimeContract'
import { humanizeRuntimeError } from '../runtimeError'
import {
  STATUS_CACHE_KEY,
  STATUS_CACHE_TTL,
  UPDATE_OUTCOME_STORAGE_KEY,
  VERSIONS_CACHE_KEY,
  VERSIONS_CACHE_TTL,
} from './constants'
import {
  filterSupportedRuntimes,
  formatRuntimeVersionDisplay,
  installedVersionKey,
  pickDefaultRuntimeVersion,
  type InstalledVersionRow,
  type RemoveMode,
  type UninstallPreview,
} from './utils'

export function useRuntimesPage() {
  const { t } = useTranslation('runtimes')
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([])
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('node')
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [installMethod, setInstallMethod] = useState<'system' | 'local'>('local')
  const [dependencies, setDependencies] = useState<
    Array<{ name: string; status: string; ok: boolean }>
  >([])
  const [showUninstallModal, setShowUninstallModal] = useState(false)
  const [removeMode, setRemoveMode] = useState<RemoveMode>('runtime_only')
  const [uninstallPreview, setUninstallPreview] = useState<UninstallPreview | null>(null)
  const [loadingUninstallPreview, setLoadingUninstallPreview] = useState(false)
  const [persistedUpdateOutcomes, setPersistedUpdateOutcomes] = useState<
    Record<string, 'already_latest' | 'updated'>
  >({})
  const [availableVersions, setAvailableVersions] = useState<string[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>('latest')
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [addToPath, setAddToPath] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [settingActivePath, setSettingActivePath] = useState<string | null>(null)
  const [removingVersionPath, setRemovingVersionPath] = useState<string | null>(null)
  const [installedVersionsCache, setInstalledVersionsCache] = useState<
    Record<string, InstalledVersionRow[]>
  >({})
  const [loadingInstalledVersions, setLoadingInstalledVersions] = useState(false)
  const [trackedInstallJobId, setTrackedInstallJobId] = useState<string | null>(null)

  const loadVersionsForRuntime = useCallback(
    async (runtimeId: string, method: 'system' | 'local', resetDefault: boolean) => {
      const cacheKey = `${runtimeId}:${method}`
      try {
        const raw = localStorage.getItem(VERSIONS_CACHE_KEY)
        if (raw) {
          const cache = JSON.parse(raw) as Record<string, { ts: number; versions: string[] }>
          const entry = cache[cacheKey]
          if (entry && Date.now() - entry.ts < VERSIONS_CACHE_TTL && entry.versions.length > 0) {
            setAvailableVersions(entry.versions)
            if (resetDefault)
              setSelectedVersion(pickDefaultRuntimeVersion(runtimeId, entry.versions))
            else
              setSelectedVersion((prev) =>
                entry.versions.includes(prev)
                  ? prev
                  : pickDefaultRuntimeVersion(runtimeId, entry.versions)
              )
            return
          }
        }
      } catch {
        /* ignore cache read errors */
      }

      setVersionsLoading(true)
      try {
        const res = await window.dh.getAvailableVersions(runtimeId, method)
        assertRuntimeOk(res, t('page.errorFetch'))
        const vs = res.versions
        setAvailableVersions(vs.length > 0 ? vs : ['latest'])
        if (vs.length === 0) return
        if (resetDefault) {
          setSelectedVersion(pickDefaultRuntimeVersion(runtimeId, vs))
        } else {
          setSelectedVersion((prev) =>
            vs.includes(prev) ? prev : pickDefaultRuntimeVersion(runtimeId, vs)
          )
        }
        try {
          const raw = localStorage.getItem(VERSIONS_CACHE_KEY)
          const cache: Record<string, { ts: number; versions: string[] }> = raw
            ? JSON.parse(raw)
            : {}
          cache[cacheKey] = { ts: Date.now(), versions: vs }
          localStorage.setItem(VERSIONS_CACHE_KEY, JSON.stringify(cache))
        } catch {
          /* ignore cache write errors */
        }
      } catch (e) {
        setAvailableVersions(['latest'])
        setErrorMessage(humanizeRuntimeError(e))
      } finally {
        setVersionsLoading(false)
      }
    },
    [t]
  )

  const refreshVersionsList = useCallback(
    (resetDefault: boolean) => loadVersionsForRuntime(selectedId, installMethod, resetDefault),
    [selectedId, installMethod, loadVersionsForRuntime]
  )

  const refreshDeps = useCallback(async () => {
    try {
      const res = await window.dh.checkDependencies(selectedId)
      assertRuntimeOk(res, t('page.errorDeps'))
      setDependencies(res.dependencies)
    } catch (e) {
      setDependencies([])
      setErrorMessage(humanizeRuntimeError(e))
    }
  }, [selectedId, t])

  const installedVersionsCacheRef = useRef(installedVersionsCache)
  useEffect(() => {
    installedVersionsCacheRef.current = installedVersionsCache
  }, [installedVersionsCache])

  const loadInstalledVersions = useCallback(async (runtimeId: string, force = false) => {
    if (!force && installedVersionsCacheRef.current[runtimeId]) return
    setLoadingInstalledVersions(true)
    try {
      const res = await window.dh.runtimeInstalledVersions(runtimeId)
      if (res.ok) {
        setInstalledVersionsCache((prev) => ({ ...prev, [runtimeId]: res.versions }))
      }
    } catch {
      // user can still install with 'latest'
    } finally {
      setLoadingInstalledVersions(false)
    }
  }, [])

  const refreshStatus = useCallback(async (background = false) => {
    if (!background) setIsRefreshing(true)
    setErrorMessage(null)
    try {
      const res = (await window.dh.runtimeStatus()) as {
        ok: boolean
        runtimes: RuntimeStatus[]
        error?: string
      }
      if (res.ok) {
        const supported = filterSupportedRuntimes(res.runtimes)
        setRuntimes(supported)
        try {
          localStorage.setItem(
            STATUS_CACHE_KEY,
            JSON.stringify({ ts: Date.now(), runtimes: supported })
          )
        } catch {
          /* ignore */
        }
      } else {
        if (!background) setErrorMessage(humanizeRuntimeError(res.error))
      }
      const jobs = (await window.dh.jobsList()) as JobSummary[]
      setActiveJobs(jobs.filter((j) => j.kind.startsWith('runtime_') || j.kind === 'install_deps'))
    } catch (e) {
      if (!background) setErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
      if (!background) setIsRefreshing(false)
    }
  }, [])

  const setRuntimeActive = useCallback(
    async (path: string, version?: string) => {
      setSettingActivePath(installedVersionKey({ path, version: version ?? path }))
      setErrorMessage(null)
      try {
        const res = (await window.dh.runtimeSetActive({
          runtimeId: selectedId,
          path,
          version,
        })) as {
          ok: boolean
          error?: string
          shellMismatch?: boolean
          shellJavaPath?: string
        }
        assertRuntimeOk(res, t('page.errorActive'))
        if (res.shellMismatch) {
          setErrorMessage(
            t('page.javaShellMismatch', {
              path: res.shellJavaPath ?? t('page.javaShellMismatchUnknown'),
            })
          )
        } else {
          setErrorMessage(null)
        }
        await refreshStatus()
        await loadInstalledVersions(selectedId, true)
      } catch (e) {
        setErrorMessage(humanizeRuntimeError(e))
      } finally {
        setSettingActivePath(null)
      }
    },
    [refreshStatus, selectedId, t, loadInstalledVersions]
  )

  const removeVersion = useCallback(
    async (version: string, path: string) => {
      if (!window.confirm(t('page.removeConfirm', { id: selectedId, version }))) return
      setRemovingVersionPath(installedVersionKey({ path, version }))
      setErrorMessage(null)
      try {
        const res = await window.dh.runtimeRemoveVersion({ runtimeId: selectedId, version, path })
        assertRuntimeOk(res, t('page.errorRemove'))
        setInstalledVersionsCache((prev) => ({
          ...prev,
          [selectedId]: (prev[selectedId] ?? []).filter((v) => v.path !== path),
        }))
        await refreshStatus()
        await loadInstalledVersions(selectedId, true)
      } catch (e) {
        setErrorMessage(humanizeRuntimeError(e))
      } finally {
        setRemovingVersionPath(null)
      }
    },
    [refreshStatus, selectedId, t, loadInstalledVersions]
  )

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STATUS_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; runtimes: RuntimeStatus[] }
        if (Date.now() - cached.ts < STATUS_CACHE_TTL && Array.isArray(cached.runtimes)) {
          setRuntimes(filterSupportedRuntimes(cached.runtimes))
          void refreshStatus(true)
          return
        }
      }
    } catch {
      /* ignore corrupt cache */
    }
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (showWizard && wizardStep === 2) void refreshDeps()

    const hasRunningJob = activeJobs.some((j) => j.state === 'running')
    const interval = hasRunningJob ? 800 : 3000
    const intervalId = setInterval(() => {
      void refreshStatus()
      if (showWizard && wizardStep === 2) void refreshDeps()
    }, interval)
    return () => clearInterval(intervalId)
  }, [refreshStatus, refreshDeps, showWizard, wizardStep, activeJobs])

  const selectedRuntime = useMemo(
    () => runtimes.find((r) => r.id === selectedId),
    [runtimes, selectedId]
  )
  const activeJob = useMemo(() => {
    if (trackedInstallJobId) {
      const tracked = activeJobs.find((j) => j.id === trackedInstallJobId)
      if (tracked) return tracked
    }
    const jobsForRuntime = activeJobs.filter((j) => {
      const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
      if (runtimeId) return runtimeId === selectedId
      return j.logTail.some(
        (line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`)
      )
    })
    const running = jobsForRuntime.filter((j) => j.state === 'running')
    if (running.length > 0) return running[running.length - 1]
    return jobsForRuntime[jobsForRuntime.length - 1]
  }, [activeJobs, selectedId, trackedInstallJobId])

  const prevJobStateRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const currentState = activeJob?.state
    if (
      prevJobStateRef.current === 'running' &&
      (currentState === 'completed' || currentState === 'failed')
    ) {
      void refreshStatus()
      void refreshDeps()
      void loadInstalledVersions(selectedId, true)
      setTrackedInstallJobId(null)
    }
    prevJobStateRef.current = currentState
  }, [activeJob?.state, refreshStatus, refreshDeps, loadInstalledVersions, selectedId])

  const installInProgress = activeJob?.state === 'running'
  const isUninstallJob = activeJob?.kind === `uninstall_${selectedId}`
  const isUpdateJob = activeJob?.kind === `update_${selectedId}`
  const latestUpdateJob = useMemo(() => {
    const updates = activeJobs
      .filter((j) => j.kind === 'runtime_update')
      .filter((j) => {
        const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
        if (runtimeId) return runtimeId === selectedId
        return j.logTail.some(
          (line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`)
        )
      })
    return updates[updates.length - 1]
  }, [activeJobs, selectedId])
  const updateOutcome = useMemo<'already_latest' | 'updated' | undefined>(() => {
    if (!latestUpdateJob || latestUpdateJob.state !== 'completed') return undefined
    const tail = latestUpdateJob.logTail.join('\n').toLowerCase()
    if (tail.includes('already latest')) return 'already_latest'
    if (tail.includes('update finished successfully')) return 'updated'
    return undefined
  }, [latestUpdateJob])
  const effectiveUpdateOutcome = updateOutcome ?? persistedUpdateOutcomes[selectedId]
  const displayedVersions = availableVersions
  const systemHasRealVersionChoice = useMemo(
    () =>
      !(
        installMethod === 'system' &&
        displayedVersions.length === 1 &&
        /system \(repo default\)|local installer \(recommended\)/i.test(displayedVersions[0] || '')
      ),
    [installMethod, displayedVersions]
  )
  const supportsLocalInstall = useMemo(
    () => runtimeSupportsLocalInstall(selectedId),
    [selectedId]
  )
  const isSystemOnlyRuntime = useMemo(() => runtimeIsSystemOnly(selectedId), [selectedId])
  const wizardSteps = useMemo(() => {
    const all = [
      { step: 1, label: t('wizard.step1') },
      { step: 2, label: t('wizard.step2') },
      { step: 3, label: t('wizard.step3') },
      { step: 4, label: t('wizard.step4') },
    ]
    return isSystemOnlyRuntime ? all.filter((s) => s.step !== 2) : all
  }, [isSystemOnlyRuntime, t])

  useEffect(() => {
    if (!supportsLocalInstall) {
      setInstallMethod('system')
    }
  }, [supportsLocalInstall, selectedId])

  const jobRuntimeId =
    (activeJob as JobSummary & { runtimeId?: string })?.runtimeId ?? selectedId
  const suggestVerifyCmd = t(jobRuntimeId + '.verify')
  const progressAction = isUninstallJob ? 'Removing' : isUpdateJob ? 'Updating' : 'Installing'
  const lastJobTail = activeJob?.logTail ?? []
  const logHasVerifyOk = lastJobTail.some((l) => /VERIFY OK/i.test(l))
  const logHasVerifyFail = lastJobTail.some((l) => l.includes('VERIFY FAIL:'))

  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPDATE_OUTCOME_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object') {
          setPersistedUpdateOutcomes(parsed as Record<string, 'already_latest' | 'updated'>)
        }
      }
    } catch {
      /* ignore malformed local storage */
    }
  }, [])

  useEffect(() => {
    if (!updateOutcome) return
    setPersistedUpdateOutcomes((prev) => {
      const next = { ...prev, [selectedId]: updateOutcome }
      try {
        localStorage.setItem(UPDATE_OUTCOME_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore storage write errors */
      }
      return next
    })
  }, [updateOutcome, selectedId])

  useEffect(() => {
    void loadInstalledVersions(selectedId)
  }, [selectedId, loadInstalledVersions])

  useEffect(() => {
    if (!showWizard || wizardStep !== 1) return
    void loadVersionsForRuntime(selectedId, installMethod, true)
  }, [showWizard, wizardStep, selectedId, installMethod, loadVersionsForRuntime])

  const detectedVersions = useMemo(() => {
    const cached = installedVersionsCache[selectedId]
    if (cached !== undefined) return cached
    if (loadingInstalledVersions) return []
    if (selectedRuntime?.installed && selectedRuntime.version) {
      return [
        {
          version: selectedRuntime.version,
          path: selectedRuntime.path ?? '',
          label: formatRuntimeVersionDisplay(selectedId, selectedRuntime.version),
          isDefault: true,
        },
      ]
    }
    return []
  }, [installedVersionsCache, selectedId, selectedRuntime, loadingInstalledVersions])

  useEffect(() => {
    if (displayedVersions.length === 0) return
    setSelectedVersion((prev) =>
      displayedVersions.includes(prev)
        ? prev
        : pickDefaultRuntimeVersion(selectedId, displayedVersions)
    )
  }, [displayedVersions, selectedId])

  const startInstall = async (id: string) => {
    setSelectedId(id)
    setTrackedInstallJobId(null)
    const systemOnly = runtimeIsSystemOnly(id)
    if (systemOnly) {
      setInstallMethod('system')
    }
    setShowWizard(true)
    setWizardStep(1)
    void loadVersionsForRuntime(id, systemOnly ? 'system' : installMethod, false)
    void loadInstalledVersions(id, true)
  }

  const startRuntimeJob = async (
    payload: Parameters<typeof window.dh.jobStart>[0],
    returnStep: number
  ): Promise<boolean> => {
    setErrorMessage(null)
    setTrackedInstallJobId(null)
    setWizardStep(3)
    const res = (await window.dh.jobStart(payload)) as {
      id?: string
      ok?: boolean
      error?: string
    }
    if (res.ok === false || res.error) {
      setErrorMessage(humanizeRuntimeError(res.error || 'Could not start install job.'))
      setWizardStep(returnStep)
      return false
    }
    if (!res.id) {
      setErrorMessage(humanizeRuntimeError('Install job did not start (missing job id).'))
      setWizardStep(returnStep)
      return false
    }
    setTrackedInstallJobId(res.id)
    void refreshStatus(true)
    return true
  }

  const runInstall = async () => {
    const returnStep = isSystemOnlyRuntime ? 1 : 2
    await startRuntimeJob(
      {
        kind: 'runtime_install',
        runtimeId: selectedId,
        method: installMethod,
        version: selectedVersion,
        addToPath,
      },
      returnStep
    )
  }

  const runUpdate = async () => {
    setShowWizard(true)
    void loadInstalledVersions(selectedId)
    await startRuntimeJob(
      {
        kind: 'runtime_update',
        runtimeId: selectedId,
        method: installMethod,
      },
      1
    )
  }

  const runUninstall = async () => {
    await startRuntimeJob(
      {
        kind: 'runtime_uninstall',
        runtimeId: selectedId,
        method: installMethod,
        removeMode,
      },
      1
    )
  }

  const openUninstallModal = async () => {
    setRemoveMode('runtime_only')
    setShowUninstallModal(true)
  }

  const fetchUninstallPreview = useCallback((runtimeId: string, mode: RemoveMode) => {
    setLoadingUninstallPreview(true)
    void window.dh
      .runtimeUninstallPreview({ runtimeId, removeMode: mode })
      .then((res) => {
        if (res.ok) {
          setUninstallPreview({
            distro: res.distro || 'unknown',
            runtimePackages: res.runtimePackages || [],
            removableDeps: res.removableDeps || [],
            blockedSharedDeps: res.blockedSharedDeps || [],
            finalPackages: res.finalPackages || [],
            note: res.note,
          })
        } else {
          setUninstallPreview(null)
          setErrorMessage(humanizeRuntimeError(res.error))
        }
      })
      .finally(() => setLoadingUninstallPreview(false))
  }, [])

  useEffect(() => {
    if (!showUninstallModal || !selectedRuntime?.installed) return
    fetchUninstallPreview(selectedId, removeMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUninstallModal, selectedId, selectedRuntime?.installed, fetchUninstallPreview])

  const cancelInstall = async () => {
    if (activeJob) {
      await window.dh.jobCancel({ id: activeJob.id })
      setShowWizard(false)
    }
  }

  return {
    t,
    runtimes,
    activeJobs,
    isRefreshing,
    selectedId,
    setSelectedId,
    showWizard,
    setShowWizard,
    wizardStep,
    setWizardStep,
    installMethod,
    setInstallMethod,
    dependencies,
    showUninstallModal,
    setShowUninstallModal,
    removeMode,
    setRemoveMode,
    uninstallPreview,
    loadingUninstallPreview,
    availableVersions,
    selectedVersion,
    setSelectedVersion,
    versionsLoading,
    addToPath,
    setAddToPath,
    errorMessage,
    setErrorMessage,
    settingActivePath,
    removingVersionPath,
    loadingInstalledVersions,
    refreshStatus,
    refreshVersionsList,
    refreshDeps,
    selectedRuntime,
    activeJob,
    installInProgress,
    isUninstallJob,
    isUpdateJob,
    effectiveUpdateOutcome,
    displayedVersions,
    systemHasRealVersionChoice,
    supportsLocalInstall,
    isSystemOnlyRuntime,
    wizardSteps,
    suggestVerifyCmd,
    progressAction,
    logHasVerifyOk,
    logHasVerifyFail,
    detectedVersions,
    startInstall,
    runInstall,
    runUpdate,
    runUninstall,
    openUninstallModal,
    fetchUninstallPreview,
    cancelInstall,
    setRuntimeActive,
    removeVersion,
  }
}

export type RuntimesPageViewModel = ReturnType<typeof useRuntimesPage>
