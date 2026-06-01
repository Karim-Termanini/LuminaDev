import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RuntimeStatus, JobSummary } from '@linux-dev-home/shared'
import {
  isSupportedRuntimeId,
  runtimeIsSystemOnly,
  runtimeSupportsLocalInstall,
} from '@linux-dev-home/shared'
import { assertRuntimeOk } from './runtimeContract'
import { humanizeRuntimeError } from './runtimeError'
import { RuntimeUninstallModal } from './runtimes/RuntimeUninstallModal'
import { RuntimeWizard } from './runtimes/RuntimeWizard'
import './RuntimesPage.css'

const RUNTIME_DETAILS: Record<string, { website: string; icon: string }> = {
  node: { website: 'https://nodejs.org', icon: 'symbol-method' },
  rust: { website: 'https://rust-lang.org', icon: 'tools' },
  python: { website: 'https://python.org', icon: 'symbol-keyword' },
  go: { website: 'https://go.dev', icon: 'zap' },
  java: { website: 'https://java.com', icon: 'beaker' },
  php: { website: 'https://php.net', icon: 'globe' },
  dotnet: { website: 'https://dotnet.microsoft.com', icon: 'library' },
}

const UPDATE_OUTCOME_STORAGE_KEY = 'dh:runtimes:update-outcomes:v2'
const STATUS_CACHE_KEY = 'dh:runtimes:status-cache:v2'
const STATUS_CACHE_TTL = 30 * 1000
const VERSIONS_CACHE_KEY = 'dh:runtimes:versions-cache:v2'
const VERSIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

type InstalledVersionRow = {
  version: string
  path: string
  label?: string
  javaHome?: string
  isDefault?: boolean
}

function filterSupportedRuntimes(rows: RuntimeStatus[]): RuntimeStatus[] {
  return rows.filter((r) => isSupportedRuntimeId(r.id))
}

/** Strip redundant runtime name prefixes from probe output for display. */
function formatRuntimeVersionDisplay(runtimeId: string, raw: string | undefined): string {
  if (!raw) return ''
  const v = raw.trim()
  switch (runtimeId) {
    case 'python':
      return v.replace(/^Python\s+/i, '')
    case 'java': {
      const quoted = v.match(/"([^"]+)"/)
      if (quoted) return quoted[1]
      return v
    }
    case 'go':
      return (
        v
          .replace(/^go version go/i, 'go')
          .replace(/\s+linux\/\S+$/, '')
          .trim() || v
      )
    case 'php':
      return v
        .replace(/^PHP\s+/i, '')
        .replace(/\s+\(.*$/, '')
        .trim()
    case 'rust':
      return (
        v
          .replace(/^rustc\s+/, '')
          .replace(/\s+\([^)]*\)\s*$/, '')
          .trim() || v
      )
    default:
      return v
  }
}

function installedVersionLabel(runtimeId: string, row: InstalledVersionRow): string {
  if (row.label) return row.label
  return formatRuntimeVersionDisplay(runtimeId, row.version)
}

function installedVersionKey(row: InstalledVersionRow): string {
  return `${row.path}\0${row.version}`
}

/** Prefer a sensible default when the version API returns many entries (e.g. Node: first LTS row). */
function pickDefaultRuntimeVersion(runtimeId: string, versions: string[]): string {
  if (versions.length === 0) return 'latest'
  if (runtimeId === 'node') {
    const lts = versions.find((v) => /\bLTS\b/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'java') {
    const lts = versions.find((v) => /\(LTS\)/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'dotnet') {
    const lts = versions.find((v) => /\bLTS\b/i.test(v))
    if (lts) return lts
  }
  if (runtimeId === 'rust') {
    return versions.includes('stable') ? 'stable' : versions[0]
  }
  return versions[0]
}

export function RuntimesPage(): ReactElement {
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
  const [removeMode, setRemoveMode] = useState<'runtime_only' | 'runtime_and_deps'>('runtime_only')
  const [uninstallPreview, setUninstallPreview] = useState<{
    distro: string
    runtimePackages: string[]
    removableDeps: string[]
    blockedSharedDeps: string[]
    finalPackages: string[]
    note?: string
  } | null>(null)
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

  const loadVersionsForRuntime = useCallback(
    async (runtimeId: string, method: 'system' | 'local', resetDefault: boolean) => {
      const cacheKey = `${runtimeId}:${method}`
      // Check localStorage cache first
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
        // Write to cache
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

  /** Same as load but for the currently selected runtime (wizard Refresh button). */
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
        const res = await window.dh.runtimeSetActive({ runtimeId: selectedId, path, version })
        assertRuntimeOk(res, t('page.errorActive'))
        setInstalledVersionsCache((prev) => {
          const next = { ...prev }
          delete next[selectedId]
          return next
        })
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

  // Mount-only: serve cached status instantly, then refresh in background
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

    // Fast poll (800ms) only while a job is running; 3s idle to avoid CPU spike
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
    const jobsForRuntime = activeJobs.filter((j) => {
      const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
      if (runtimeId) return runtimeId === selectedId
      return j.logTail.some(
        (line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`)
      )
    })
    return jobsForRuntime[jobsForRuntime.length - 1]
  }, [activeJobs, selectedId])

  // Auto-refresh status + deps when the active job finishes (must be after activeJob is defined).
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
  const supportsLocalInstall = useMemo(() => runtimeSupportsLocalInstall(selectedId), [selectedId])
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

  const jobRuntimeId = (activeJob as JobSummary & { runtimeId?: string })?.runtimeId ?? selectedId
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
    if (cached !== undefined && cached.length > 0) return cached
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
    return cached ?? []
  }, [installedVersionsCache, selectedId, selectedRuntime])

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
    const systemOnly = runtimeIsSystemOnly(id)
    if (systemOnly) {
      setInstallMethod('system')
    }
    setShowWizard(true)
    setWizardStep(1)
    void loadVersionsForRuntime(id, systemOnly ? 'system' : installMethod, false)
    void loadInstalledVersions(id, true)
  }

  const runInstall = async () => {
    setWizardStep(3)
    await window.dh.jobStart({
      kind: 'runtime_install',
      runtimeId: selectedId,
      method: installMethod,
      version: selectedVersion,
      addToPath,
    })
  }

  const runUpdate = async () => {
    setShowWizard(true)
    void loadInstalledVersions(selectedId)
    setWizardStep(3)
    await window.dh.jobStart({
      kind: 'runtime_update',
      runtimeId: selectedId,
      method: installMethod,
    })
  }

  const runUninstall = async () => {
    setWizardStep(3)
    await window.dh.jobStart({
      kind: 'runtime_uninstall',
      runtimeId: selectedId,
      method: installMethod,
      removeMode,
    })
  }

  const openUninstallModal = async () => {
    setRemoveMode('runtime_only')
    setShowUninstallModal(true)
  }

  const fetchUninstallPreview = useCallback((runtimeId: string, mode: typeof removeMode) => {
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

  // Fetch preview when modal opens or selected runtime changes — NOT on every removeMode toggle.
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

  return (
    <div
      className="runtimes-page elevated-page"
      style={{
        display: 'flex',
        height: 'calc(100vh - 120px)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Sidebar List */}
      <aside
        style={{
          width: 280,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            padding: '20px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: '0.05em',
              color: 'var(--text-muted)',
            }}
          >
            {t('page.sidebarTitle')}
          </div>
          <button
            onClick={() => void refreshStatus()}
            className="hp-btn-icon"
            title={t('page.refresh')}
            disabled={isRefreshing}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isRefreshing ? 'default' : 'pointer',
              opacity: isRefreshing ? 0.65 : 1,
            }}
          >
            <span
              className={`codicon ${isRefreshing ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`}
            />
          </button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {runtimes.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setSelectedId(r.id)
                setShowWizard(false)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                border: 'none',
                background: selectedId === r.id ? 'rgba(124, 77, 255, 0.15)' : 'transparent',
                color: selectedId === r.id ? 'var(--accent)' : 'var(--text-main)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
              }}
            >
              <span
                className={`codicon codicon-${RUNTIME_DETAILS[r.id]?.icon || 'code'}`}
                style={{ fontSize: 18 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {r.installed
                    ? formatRuntimeVersionDisplay(r.id, r.version)
                    : t('page.notInstalled')}
                </div>
              </div>
              {r.installed && (
                <span
                  className="codicon codicon-check"
                  style={{ color: 'var(--green)', fontSize: 12 }}
                />
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-main)',
          overflowY: 'auto',
        }}
      >
        {errorMessage && (
          <div
            style={{
              padding: '12px 20px',
              background: 'rgba(255, 82, 82, 0.1)',
              borderBottom: '1px solid rgba(255, 82, 82, 0.2)',
              color: '#ff8a80',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="codicon codicon-error" />
              {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ff8a80',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        )}
        {selectedRuntime && !showWizard ? (
          <div style={{ padding: 40, maxWidth: 800 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: 'rgba(124, 77, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 40,
                    color: 'var(--accent)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  }}
                >
                  <span
                    className={`codicon codicon-${RUNTIME_DETAILS[selectedId]?.icon || 'code'}`}
                  />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>
                    {selectedRuntime.name}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 700,
                        background: selectedRuntime.installed
                          ? 'rgba(0, 230, 118, 0.1)'
                          : 'rgba(255, 255, 255, 0.05)',
                        color: selectedRuntime.installed ? 'var(--green)' : 'var(--text-muted)',
                        border: `1px solid ${selectedRuntime.installed ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.1)'}`,
                      }}
                    >
                      {selectedRuntime.installed ? t('page.installed') : t('page.available')}
                    </span>
                    {selectedRuntime.installed && (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {t('page.version', {
                          v: formatRuntimeVersionDisplay(selectedId, selectedRuntime.version),
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => startInstall(selectedId)}
                  disabled={installInProgress}
                  style={{
                    padding: '12px 24px',
                    borderRadius: 12,
                    border: 'none',
                    background: 'var(--accent)',
                    color: 'white',
                    fontWeight: 700,
                    cursor: installInProgress ? 'default' : 'pointer',
                    opacity: installInProgress ? 0.6 : 1,
                    boxShadow: '0 4px 15px rgba(124, 77, 255, 0.3)',
                  }}
                >
                  {installInProgress && !isUninstallJob && !isUpdateJob
                    ? t('view.installing')
                    : t('view.installVersion')}
                </button>

                {selectedRuntime.installed && (
                  <>
                    <button
                      onClick={() => void runUpdate()}
                      disabled={installInProgress}
                      style={{
                        padding: '12px 20px',
                        borderRadius: 12,
                        border: '1px solid var(--border)',
                        background:
                          effectiveUpdateOutcome === 'already_latest'
                            ? 'rgba(255, 193, 7, 0.1)'
                            : effectiveUpdateOutcome === 'updated'
                              ? 'rgba(0, 230, 118, 0.1)'
                              : 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontWeight: 700,
                        cursor: installInProgress ? 'default' : 'pointer',
                        opacity: installInProgress ? 0.6 : 1,
                      }}
                    >
                      {isUpdateJob
                        ? t('view.updating')
                        : effectiveUpdateOutcome === 'already_latest'
                          ? t('view.installLatest')
                          : t('view.updateCurrent')}
                    </button>
                    <button
                      onClick={() => void openUninstallModal()}
                      disabled={installInProgress}
                      style={{
                        padding: '12px 20px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,82,82,0.35)',
                        background: 'rgba(255,82,82,0.1)',
                        color: '#ff8a80',
                        fontWeight: 700,
                        cursor: installInProgress ? 'default' : 'pointer',
                        opacity: installInProgress ? 0.5 : 1,
                      }}
                    >
                      {t('view.remove')}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div style={{ marginTop: 48 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {t('view.description')}
              </h3>
              <p style={{ fontSize: 16, color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.8 }}>
                {t(selectedId + '.desc')}
              </p>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  window.dh.openExternal(RUNTIME_DETAILS[selectedId]?.website || '')
                }}
                style={{
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 12,
                  display: 'inline-block',
                }}
              >
                {t('view.visitWebsite')}
              </a>
            </div>

            {selectedRuntime.installed && detectedVersions.length > 0 && (
              <div style={{ marginTop: 40 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                  {t('view.detected')}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {loadingInstalledVersions ? (
                    <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      <span
                        className="codicon codicon-loading codicon-modifier-spin"
                        style={{ marginRight: 6 }}
                      />
                      {t('view.loadingDetected')}
                    </div>
                  ) : (
                    detectedVersions.map((v) => {
                      const rowKey = installedVersionKey(v)
                      const displayLabel = installedVersionLabel(selectedId, v)
                      const isActive = v.isDefault === true
                      return (
                        <div
                          key={rowKey}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 12,
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>
                              {selectedId === 'java' && v.label
                                ? v.label
                                : t('page.version', { v: displayLabel })}
                            </div>
                            {selectedId === 'java' && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  marginTop: 2,
                                  fontFamily: 'monospace',
                                }}
                              >
                                JAVA_HOME={v.javaHome ?? v.path.replace(/\/bin\/java$/, '')}
                              </div>
                            )}
                            {selectedId !== 'java' && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                  marginTop: 2,
                                  fontFamily: 'monospace',
                                }}
                              >
                                {v.path}
                              </div>
                            )}
                            {selectedId === 'java' && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
                                  marginTop: 2,
                                  fontFamily: 'monospace',
                                  opacity: 0.75,
                                }}
                              >
                                {v.path}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isActive && (
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  color: 'var(--green)',
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  border: '1px solid rgba(0,230,118,0.3)',
                                  background: 'rgba(0,230,118,0.05)',
                                }}
                              >
                                {t('page.active')}
                              </span>
                            )}
                            {!isActive && (
                              <button
                                type="button"
                                onClick={() => void setRuntimeActive(v.path, v.version)}
                                disabled={installInProgress || settingActivePath === rowKey}
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '6px 10px',
                                  borderRadius: 10,
                                  border: '1px solid var(--border)',
                                  background: 'rgba(255,255,255,0.04)',
                                  color: 'var(--text-main)',
                                  cursor:
                                    installInProgress || settingActivePath === rowKey
                                      ? 'default'
                                      : 'pointer',
                                  opacity:
                                    installInProgress || settingActivePath === rowKey ? 0.55 : 1,
                                }}
                              >
                                {settingActivePath === rowKey
                                  ? t('view.switching')
                                  : t('view.switch')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void removeVersion(v.version, v.path)}
                              disabled={
                                installInProgress || removingVersionPath === rowKey || isActive
                              }
                              title={
                                isActive
                                  ? t('view.cannotRemoveActive')
                                  : t('page.removeVersion', { v: displayLabel })
                              }
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: '1px solid rgba(255,82,82,0.3)',
                                background: 'rgba(255,82,82,0.08)',
                                color: isActive ? 'var(--text-muted)' : '#ff5252',
                                cursor:
                                  installInProgress || removingVersionPath === rowKey || isActive
                                    ? 'default'
                                    : 'pointer',
                                opacity:
                                  installInProgress || removingVersionPath === rowKey || isActive
                                    ? 0.4
                                    : 1,
                              }}
                            >
                              {removingVersionPath === rowKey
                                ? t('view.removing')
                                : t('view.remove')}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : showWizard ? (
          <RuntimeWizard
            runtime={selectedRuntime}
            runtimeId={selectedId}
            wizardSteps={wizardSteps}
            wizardStep={wizardStep}
            installMethod={installMethod}
            selectedVersion={selectedVersion}
            availableVersions={displayedVersions}
            versionsLoading={versionsLoading}
            addToPath={addToPath}
            dependencies={dependencies}
            activeJob={activeJob}
            isUninstallJob={isUninstallJob}
            isUpdateJob={isUpdateJob}
            isSystemOnlyRuntime={isSystemOnlyRuntime}
            supportsLocalInstall={supportsLocalInstall}
            systemHasRealVersionChoice={systemHasRealVersionChoice}
            progressAction={progressAction}
            suggestVerifyCmd={suggestVerifyCmd}
            logHasVerifyOk={logHasVerifyOk}
            logHasVerifyFail={logHasVerifyFail}
            t={t}
            onClose={() => setShowWizard(false)}
            onSetInstallMethod={setInstallMethod}
            onSetSelectedVersion={setSelectedVersion}
            onSetAddToPath={setAddToPath}
            onRefreshVersions={refreshVersionsList}
            onSetWizardStep={setWizardStep}
            onRunInstall={runInstall}
            onCancelInstall={cancelInstall}
            onInstallDeps={(runtimeId) => {
              void window.dh.jobStart({ kind: 'install_deps', runtimeId })
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            {t('page.selectPrompt')}
          </div>
        )}
      </main>
      {showUninstallModal && selectedRuntime && (
        <RuntimeUninstallModal
          runtime={selectedRuntime}
          runtimeId={selectedId}
          removeMode={removeMode}
          uninstallPreview={uninstallPreview}
          loadingUninstallPreview={loadingUninstallPreview}
          t={t}
          onClose={() => setShowUninstallModal(false)}
          onSetRemoveMode={setRemoveMode}
          onFetchPreview={fetchUninstallPreview}
          onConfirmUninstall={() => {
            setShowUninstallModal(false)
            void runUninstall()
          }}
        />
      )}
    </div>
  )
}
