import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { RuntimeStatus, JobSummary } from '@linux-dev-home/shared'
import { assertRuntimeOk } from './runtimeContract'
import { humanizeRuntimeError } from './runtimeError'
import './RuntimesPage.css'

const RUNTIME_DETAILS: Record<string, { website: string, icon: string }> = {
  node: { website: 'https://nodejs.org', icon: 'symbol-method' },
  rust: { website: 'https://rust-lang.org', icon: 'tools' },
  python: { website: 'https://python.org', icon: 'symbol-keyword' },
  go: { website: 'https://go.dev', icon: 'zap' },
  java: { website: 'https://java.com', icon: 'beaker' },
  php: { website: 'https://php.net', icon: 'globe' },
  ruby: { website: 'https://ruby-lang.org', icon: 'ruby' },
  dotnet: { website: 'https://dotnet.microsoft.com', icon: 'library' },
  bun: { website: 'https://bun.sh', icon: 'flame' },
  zig: { website: 'https://ziglang.org', icon: 'circuit-board' },
  c_cpp: { website: 'https://gcc.gnu.org', icon: 'terminal-bash' },
  matlab: { website: 'https://octave.org', icon: 'graph-line' },
  dart: { website: 'https://dart.dev', icon: 'symbol-namespace' },
  flutter: { website: 'https://flutter.dev', icon: 'device-mobile' },
  julia: { website: 'https://julialang.org', icon: 'symbol-color' },
  lua: { website: 'https://www.lua.org', icon: 'symbol-variable' },
  lisp: { website: 'https://www.sbcl.org', icon: 'symbol-class' },
}

const RUNTIME_LOCALE_KEY: Record<string, string> = {
  c_cpp: 'cpp',
  matlab: 'octave',
  lisp: 'clisp',
}

const UPDATE_OUTCOME_STORAGE_KEY = 'dh:runtimes:update-outcomes:v1'
const STATUS_CACHE_KEY = 'dh:runtimes:status-cache:v1'
const STATUS_CACHE_TTL = 30 * 1000

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
  if (runtimeId === 'bun') {
    const stable = versions.find((v) => /^\d+\.\d+\.\d+$/.test(v))
    if (stable) return stable
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
  const [dependencies, setDependencies] = useState<Array<{ name: string; status: string; ok: boolean }>>([])
  const [showUninstallModal, setShowUninstallModal] = useState(false)
  const [removeMode, setRemoveMode] = useState<'runtime_only' | 'runtime_and_deps'>('runtime_only')
  const [uninstallPreview, setUninstallPreview] = useState<{ distro: string; runtimePackages: string[]; removableDeps: string[]; blockedSharedDeps: string[]; finalPackages: string[]; note?: string } | null>(null)
  const [loadingUninstallPreview, setLoadingUninstallPreview] = useState(false)
  const [persistedUpdateOutcomes, setPersistedUpdateOutcomes] = useState<Record<string, 'already_latest' | 'updated'>>({})
  const [availableVersions, setAvailableVersions] = useState<string[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>('latest')
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [addToPath, setAddToPath] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [settingActivePath, setSettingActivePath] = useState<string | null>(null)
  const [removingVersionPath, setRemovingVersionPath] = useState<string | null>(null)
  const [installedVersionsCache, setInstalledVersionsCache] = useState<Record<string, Array<{ version: string; path: string }>>>({})
  const [loadingInstalledVersions, setLoadingInstalledVersions] = useState(false)

  const VERSIONS_CACHE_KEY = 'dh:runtimes:versions-cache:v1'
  const VERSIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
  const loadVersionsForRuntime = useCallback(async (runtimeId: string, method: 'system' | 'local', resetDefault: boolean) => {
    const cacheKey = `${runtimeId}:${method}`
    // Check localStorage cache first
    try {
      const raw = localStorage.getItem(VERSIONS_CACHE_KEY)
      if (raw) {
        const cache = JSON.parse(raw) as Record<string, { ts: number; versions: string[] }>
        const entry = cache[cacheKey]
        if (entry && Date.now() - entry.ts < VERSIONS_CACHE_TTL && entry.versions.length > 0) {
          setAvailableVersions(entry.versions)
          if (resetDefault) setSelectedVersion(pickDefaultRuntimeVersion(runtimeId, entry.versions))
          else setSelectedVersion((prev) => (entry.versions.includes(prev) ? prev : pickDefaultRuntimeVersion(runtimeId, entry.versions)))
          return
        }
      }
    } catch { /* ignore cache read errors */ }

    setVersionsLoading(true)
    try {
      const res = await window.dh.getAvailableVersions(runtimeId, method)
      assertRuntimeOk(res, t('page.errorFetch'))
      const vs = res.versions
      setAvailableVersions(vs)
      if (vs.length === 0) return
      if (resetDefault) {
        setSelectedVersion(pickDefaultRuntimeVersion(runtimeId, vs))
      } else {
        setSelectedVersion((prev) => (vs.includes(prev) ? prev : pickDefaultRuntimeVersion(runtimeId, vs)))
      }
      // Write to cache
      try {
        const raw = localStorage.getItem(VERSIONS_CACHE_KEY)
        const cache: Record<string, { ts: number; versions: string[] }> = raw ? JSON.parse(raw) : {}
        cache[cacheKey] = { ts: Date.now(), versions: vs }
        localStorage.setItem(VERSIONS_CACHE_KEY, JSON.stringify(cache))
      } catch { /* ignore cache write errors */ }
    } catch (e) {
      setAvailableVersions(['latest'])
      setErrorMessage(humanizeRuntimeError(e))
    } finally {
      setVersionsLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Same as load but for the currently selected runtime (wizard Refresh button). */
  const refreshVersionsList = useCallback(
    (resetDefault: boolean) => loadVersionsForRuntime(selectedId, installMethod, resetDefault),
    [selectedId, installMethod, loadVersionsForRuntime],
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

  const loadInstalledVersions = useCallback(async (runtimeId: string) => {
    if (installedVersionsCache[runtimeId]) return
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
  }, [installedVersionsCache])

  const refreshStatus = useCallback(async (background = false) => {
    if (!background) setIsRefreshing(true)
    setErrorMessage(null)
    try {
      const res = await window.dh.runtimeStatus() as { ok: boolean; runtimes: RuntimeStatus[]; error?: string }
      if (res.ok) {
        setRuntimes(res.runtimes)
        try {
          localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({ ts: Date.now(), runtimes: res.runtimes }))
        } catch { /* ignore */ }
      } else {
        if (!background) setErrorMessage(humanizeRuntimeError(res.error))
      }
      const jobs = await window.dh.jobsList() as JobSummary[]
      setActiveJobs(jobs.filter((j) => j.kind.startsWith('runtime_') || j.kind === 'install_deps'))
    } catch (e) {
      if (!background) setErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
      if (!background) setIsRefreshing(false)
    }
  }, [])

  const setRuntimeActive = useCallback(
    async (path: string) => {
      setSettingActivePath(path)
      setErrorMessage(null)
      try {
        const res = await window.dh.runtimeSetActive({ runtimeId: selectedId, path })
        assertRuntimeOk(res, t('page.errorActive'))
        await refreshStatus()
      } catch (e) {
        setErrorMessage(humanizeRuntimeError(e))
      } finally {
        setSettingActivePath(null)
      }
    },
    [refreshStatus, selectedId, t],
  )

  const removeVersion = useCallback(
    async (version: string, path: string) => {
      if (!window.confirm(t('page.removeConfirm', { id: selectedId, version }))) return
      setRemovingVersionPath(path)
      setErrorMessage(null)
      try {
        const res = await window.dh.runtimeRemoveVersion({ runtimeId: selectedId, version, path })
        assertRuntimeOk(res, t('page.errorRemove'))
        await refreshStatus()
      } catch (e) {
        setErrorMessage(humanizeRuntimeError(e))
      } finally {
        setRemovingVersionPath(null)
      }
    },
    [refreshStatus, selectedId, t],
  )

  // Mount-only: serve cached status instantly, then refresh in background
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STATUS_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; runtimes: RuntimeStatus[] }
        if (Date.now() - cached.ts < STATUS_CACHE_TTL && Array.isArray(cached.runtimes)) {
          setRuntimes(cached.runtimes)
          void refreshStatus(true)
          return
        }
      }
    } catch { /* ignore corrupt cache */ }
    void refreshStatus()
  }, [refreshStatus]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const selectedRuntime = useMemo(() => runtimes.find(r => r.id === selectedId), [runtimes, selectedId])
  const activeJob = useMemo(() => {
    const jobsForRuntime = activeJobs.filter((j) => {
      const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
      if (runtimeId) return runtimeId === selectedId
      return j.logTail.some((line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`))
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
    }
    prevJobStateRef.current = currentState
  }, [activeJob?.state, refreshStatus, refreshDeps])

  const installInProgress = activeJob?.state === 'running'
  const isUninstallJob = activeJob?.kind === `uninstall_${selectedId}`
  const isUpdateJob = activeJob?.kind === `update_${selectedId}`
  const latestUpdateJob = useMemo(() => {
    const updates = activeJobs.filter((j) => j.kind === 'runtime_update').filter((j) => {
      const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
      if (runtimeId) return runtimeId === selectedId
      return j.logTail.some((line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`))
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
    () => !(installMethod === 'system' && displayedVersions.length === 1 && /system \(repo default\)|local installer \(recommended\)/i.test(displayedVersions[0] || '')),
    [installMethod, displayedVersions],
  )

  const rtLocaleKey = RUNTIME_LOCALE_KEY[selectedId] ?? selectedId
  const suggestVerifyCmd = t(rtLocaleKey + '.verify')
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
    setAvailableVersions([])
    setSelectedVersion('latest')
    void loadVersionsForRuntime(selectedId, installMethod, true)
  }, [selectedId, installMethod, loadVersionsForRuntime])

  useEffect(() => {
    if (displayedVersions.length === 0) return
    setSelectedVersion((prev) => (
      displayedVersions.includes(prev) ? prev : pickDefaultRuntimeVersion(selectedId, displayedVersions)
    ))
  }, [displayedVersions, selectedId])

  const startInstall = async (id: string) => {
    setSelectedId(id)
    setShowWizard(true)
    setWizardStep(1)
    void loadVersionsForRuntime(id, installMethod, true)
    void loadInstalledVersions(id)
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
    void window.dh.runtimeUninstallPreview({ runtimeId, removeMode: mode })
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
    <div className="runtimes-page elevated-page" style={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden', position: 'relative' }}>
      {/* Sidebar List */}
      <aside style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>{t('page.sidebarTitle')}</div>
          <button 
            onClick={() => void refreshStatus()}
            className="hp-btn-icon" 
            title={t('page.refresh')}
            disabled={isRefreshing}
            style={{ padding: 4, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: isRefreshing ? 'default' : 'pointer', opacity: isRefreshing ? 0.65 : 1 }}
          >
             <span className={`codicon ${isRefreshing ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
          </button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {runtimes.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelectedId(r.id); setShowWizard(false); }}
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
                transition: 'all 0.2s'
              }}
            >
              <span className={`codicon codicon-${RUNTIME_DETAILS[r.id]?.icon || 'code'}`} style={{ fontSize: 18 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {r.installed ? r.version : t('page.notInstalled')}
                </div>
              </div>
              {r.installed && <span className="codicon codicon-check" style={{ color: 'var(--green)', fontSize: 12 }} />}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', overflowY: 'auto' }}>
        {errorMessage && (
          <div style={{ padding: '12px 20px', background: 'rgba(255, 82, 82, 0.1)', borderBottom: '1px solid rgba(255, 82, 82, 0.2)', color: '#ff8a80', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="codicon codicon-error" />
              {errorMessage}
            </div>
            <button onClick={() => setErrorMessage(null)} style={{ background: 'transparent', border: 'none', color: '#ff8a80', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
        )}
        {selectedRuntime && !showWizard ? (
          <div style={{ padding: 40, maxWidth: 800 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <div style={{ 
                  width: 80, 
                  height: 80, 
                  borderRadius: 20, 
                  background: 'rgba(124, 77, 255, 0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: 40,
                  color: 'var(--accent)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                }}>
                  <span className={`codicon codicon-${RUNTIME_DETAILS[selectedId]?.icon || 'code'}`} />
                </div>
                <div>
                  <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800 }}>{selectedRuntime.name}</h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: 20, 
                      fontSize: 11, 
                      fontWeight: 700, 
                      background: selectedRuntime.installed ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                      color: selectedRuntime.installed ? 'var(--green)' : 'var(--text-muted)',
                      border: `1px solid ${selectedRuntime.installed ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255,255,255,0.1)'}`
                    }}>
                      {selectedRuntime.installed ? t('page.installed') : t('page.available')}
                    </span>
                    {selectedRuntime.installed && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('page.version', { v: selectedRuntime.version })}</span>}
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
                     boxShadow: '0 4px 15px rgba(124, 77, 255, 0.3)'
                   }}
                 >
                   {installInProgress && !isUninstallJob && !isUpdateJob ? t('view.installing') : t('view.installVersion')}
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
                         background: effectiveUpdateOutcome === 'already_latest'
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
                       {isUpdateJob ? t('view.updating') : (effectiveUpdateOutcome === 'already_latest' ? t('view.installLatest') : t('view.updateCurrent'))}
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
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t('view.description')}</h3>
              <p style={{ fontSize: 16, color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.8 }}>
                {t(rtLocaleKey + '.desc')}
              </p>
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); window.dh.openExternal(RUNTIME_DETAILS[selectedId]?.website || '') }}
                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 600, marginTop: 12, display: 'inline-block' }}
              >
                {t('view.visitWebsite')}
              </a>
            </div>

            {selectedRuntime.installed && (installedVersionsCache[selectedId] || selectedRuntime.allVersions) && (
              <div style={{ marginTop: 40 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t('view.detected')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {loadingInstalledVersions ? (
                    <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      <span className="codicon codicon-loading codicon-modifier-spin" style={{ marginRight: 6 }} />
                      Loading installed versions...
                    </div>
                  ) : (
                    (installedVersionsCache[selectedId] ?? selectedRuntime.allVersions ?? []).map((v, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border)'
                      }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{t('page.version', { v: v.version })}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{v.path}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {v.path === selectedRuntime.path && (
                            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(0,230,118,0.3)', background: 'rgba(0,230,118,0.05)' }}>
                              {t('page.active')}
                            </span>
                          )}
                          {v.path !== selectedRuntime.path && (
                            <button
                              type="button"
                              onClick={() => void setRuntimeActive(v.path)}
                              disabled={installInProgress || settingActivePath === v.path}
                              style={{
                                fontSize: 11,
                                fontWeight: 800,
                                padding: '6px 10px',
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-main)',
                                cursor: installInProgress || settingActivePath === v.path ? 'default' : 'pointer',
                                opacity: installInProgress || settingActivePath === v.path ? 0.55 : 1,
                              }}
                            >
                              {settingActivePath === v.path ? t('view.switching') : t('view.switch')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void removeVersion(v.version, v.path)}
                            disabled={installInProgress || removingVersionPath === v.path || v.path === selectedRuntime.path}
                            title={v.path === selectedRuntime.path ? t('view.cannotRemoveActive') : t('page.removeVersion', { v: v.version })}
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '6px 10px',
                              borderRadius: 10,
                              border: '1px solid rgba(255,82,82,0.3)',
                              background: 'rgba(255,82,82,0.08)',
                              color: v.path === selectedRuntime.path ? 'var(--text-muted)' : '#ff5252',
                              cursor: installInProgress || removingVersionPath === v.path || v.path === selectedRuntime.path ? 'default' : 'pointer',
                              opacity: installInProgress || removingVersionPath === v.path || v.path === selectedRuntime.path ? 0.4 : 1,
                            }}
                          >
                            {removingVersionPath === v.path ? t('view.removing') : t('view.remove')}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : showWizard ? (
          <div style={{ padding: 40, height: '100%', display: 'flex', flexDirection: 'column' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
                <button onClick={() => setShowWizard(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                   <span className="codicon codicon-arrow-left" style={{ fontSize: 20 }} />
                </button>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{t('wizard.setup', { name: selectedRuntime?.name })}</h2>
             </div>

             <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Stepper Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
                   {[
                     { step: 1, label: t('wizard.step1') },
                     { step: 2, label: t('wizard.step2') },
                     { step: 3, label: t('wizard.step3') },
                     { step: 4, label: t('wizard.step4') }
                   ].map((s) => (
                     <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: wizardStep >= s.step ? 1 : 0.3 }}>
                        <div style={{ 
                          width: 24, height: 24, borderRadius: '50%', 
                          background: wizardStep > s.step ? 'var(--green)' : wizardStep === s.step ? 'var(--accent)' : 'var(--border)',
                          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700
                        }}>
                          {wizardStep > s.step ? '✔' : s.step}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                     </div>
                   ))}
                </div>

                {/* Step Content */}
                <div style={{ flex: 1, padding: 40, overflowY: 'auto' }}>
                   {wizardStep === 1 && (
                     <div>
                        <h3 style={{ marginTop: 0 }}>{t('wizConfig.title')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>{t('wizConfig.desc', { name: selectedRuntime?.name })}</p>
                        
                        <div className="hp-card" style={{ marginBottom: 20 }}>
                           <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('wizConfig.method')}</div>
                           <div style={{ display: 'flex', gap: 12 }}>
                              <button 
                                onClick={() => setInstallMethod('system')}
                                style={{ 
                                  flex: 1, padding: 16, borderRadius: 12, border: `2px solid ${installMethod === 'system' ? 'var(--accent)' : 'var(--border)'}`,
                                  background: installMethod === 'system' ? 'rgba(124, 77, 255, 0.1)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left'
                                }}
                              >
                                 <div style={{ fontWeight: 700, fontSize: 14 }}>{t('wizConfig.system')}</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('wizConfig.systemDesc')}</div>
                              </button>
                              <button 
                                onClick={() => setInstallMethod('local')}
                                style={{ 
                                  flex: 1, padding: 16, borderRadius: 12, border: `2px solid ${installMethod === 'local' ? 'var(--accent)' : 'var(--border)'}`,
                                  background: installMethod === 'local' ? 'rgba(124, 77, 255, 0.1)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left'
                                }}
                              >
                                 <div style={{ fontWeight: 700, fontSize: 14 }}>{t('wizConfig.local')}</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('wizConfig.localDesc')}</div>
                              </button>
                           </div>
                        </div>

                        <div className="hp-card" style={{ marginBottom: 20 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                             <div style={{ fontWeight: 600 }}>{t(installMethod === 'system' && !systemHasRealVersionChoice ? 'wizConfig.repoTrack' : 'wizConfig.targetVersion')}</div>
                             <button
                               type="button"
                               className="hp-btn-icon"
                               title={t('wizConfig.refreshTitle')}
                               disabled={versionsLoading}
                               onClick={() => void refreshVersionsList(false)}
                               style={{
                                 padding: '6px 10px',
                                 border: '1px solid var(--border)',
                                 borderRadius: 8,
                                 background: 'rgba(255,255,255,0.04)',
                                 color: 'var(--text-muted)',
                                 cursor: versionsLoading ? 'default' : 'pointer',
                                 opacity: versionsLoading ? 0.65 : 1,
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: 6,
                                 fontSize: 12,
                                 fontWeight: 600,
                               }}
                             >
                               <span className={`codicon ${versionsLoading ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
                               {t('wizConfig.refresh')}
                             </button>
                           </div>
                           <select 
                             className="hp-input" 
                             style={{ width: '100%', opacity: versionsLoading && displayedVersions.length === 0 ? 0.6 : 1 }} 
                             value={selectedVersion} 
                             disabled={(versionsLoading && displayedVersions.length === 0) || (installMethod === 'system' && !systemHasRealVersionChoice)}
                             onChange={(e) => setSelectedVersion(e.target.value)}
                           >
                             {displayedVersions.map(v => <option key={v} value={v}>{v}</option>)}
                           </select>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                             {t('wizConfig.apiNote')}
                           </div>
                           {selectedId === 'java' && installMethod === 'system' && (
                             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                               {t('wizConfig.systemNote')}
                             </div>
                           )}
                           {installMethod === 'system' && selectedId !== 'java' && (
                             <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                               {t('wizConfig.systemModeNote')}
                             </div>
                           )}
                           {installMethod === 'system' && (
                             <div
                               role="note"
                               style={{
                                 marginTop: 14,
                                 padding: '10px 12px',
                                 borderRadius: 10,
                                 border: '1px solid rgba(255, 183, 77, 0.45)',
                                 background: 'rgba(255, 183, 77, 0.1)',
                                 fontSize: 12,
                                 color: 'var(--text-main)',
                                 lineHeight: 1.45,
                               }}
                             >
                               {t('wizConfig.methodNote')}
                             </div>
                           )}
                        </div>

                        <div className="hp-card">
                           <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={addToPath} 
                                onChange={(e) => setAddToPath(e.target.checked)} 
                              />
                              <div>
                                 <div style={{ fontWeight: 600 }}>{t('wizConfig.addToPath')}</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('wizConfig.addToPathDesc')}</div>
                              </div>
                           </label>
                        </div>
                     </div>
                   )}

                   {wizardStep === 2 && (
                     <div>
                        <h3 style={{ marginTop: 0 }}>{t('wizDeps.title')}</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>{t('wizDeps.desc', { name: selectedRuntime?.name })}</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                           {dependencies.length > 0 ? dependencies.map((d, idx) => {
                             const isInstalling = activeJob?.kind === 'install_deps' && activeJob?.state === 'running';
                             const totalDeps = dependencies.length;
                             const depProgressWeight = 100 / totalDeps;
                             const currentDepIdx = Math.floor((activeJob?.progress || 0) / depProgressWeight);
                             const isCurrent = isInstalling && currentDepIdx === idx;
                             const isFinished = isInstalling && currentDepIdx > idx;
                             
                             // Calculate sub-progress for current item
                             const itemSubProgress = isCurrent ? ((activeJob?.progress || 0) % depProgressWeight) * (100 / depProgressWeight) : (isFinished ? 100 : 0);

                             return (
                               <div key={d.name} style={{ position: 'relative', overflow: 'hidden', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                  {/* Background progress bar */}
                                  {(isCurrent || isFinished) && (
                                    <div style={{ 
                                      position: 'absolute', 
                                      bottom: 0, left: 0, height: 3, 
                                      width: `${itemSubProgress}%`, 
                                      background: isFinished ? 'var(--green)' : 'var(--accent)',
                                      transition: 'width 0.3s ease'
                                    }} />
                                  )}
                                  
                                  <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                                    <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                      {d.name}
                                      {isCurrent && <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 12, color: 'var(--accent)' }} />}
                                      {isFinished && <span className="codicon codicon-pass" style={{ fontSize: 12, color: 'var(--green)' }} />}
                                    </span>
                                    <span style={{ color: d.ok || isFinished ? 'var(--green)' : 'var(--orange)', fontSize: 12, fontWeight: 700 }}>
                                      {isFinished ? t('page.installed') : (isCurrent ? t('view.installing') : d.status)}
                                    </span>
                                  </div>
                               </div>
                             );
                           }) : (
                             <div style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>{t('wizDeps.checking')}</div>
                           )}
                        </div>
                        
                        {!selectedRuntime?.installed && (
                          <div style={{ marginTop: 24, padding: 16, background: 'rgba(255, 152, 0, 0.1)', borderRadius: 8, border: '1px solid rgba(255, 152, 0, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div style={{ fontSize: 13 }}>
                                {t('wizDeps.headerNote')}
                             </div>
                             <button 
                              onClick={() => window.dh.jobStart({ kind: 'install_deps', runtimeId: selectedId })}
                               className="hp-btn" 
                               style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 700 }}
                             >
                                {t('wizDeps.fixBtn')}
                             </button>
                          </div>
                        )}
                     </div>
                   )}

                   {wizardStep === 3 && (
                     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <h3 style={{ marginTop: 0 }}>{t('wizProgress.title', { action: progressAction, name: selectedRuntime?.name })}</h3>
                           {activeJob?.state === 'running' && (
                             <button 
                               onClick={cancelInstall}
                               style={{ background: 'rgba(255, 82, 82, 0.1)', color: '#ff5252', border: '1px solid rgba(255, 82, 82, 0.2)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                             >
                               {t('wizProgress.cancel')}
                             </button>
                           )}
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>
                          {t(isUninstallJob ? 'wizProgress.pleaseWaitRemove' : isUpdateJob ? 'wizProgress.pleaseWaitUpdate' : 'wizProgress.pleaseWaitInstall')}
                        </p>

                        <div style={{ marginTop: 24 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {activeJob?.progress === 100 ? t('wizProgress.verifyStep') : t(isUninstallJob ? 'wizProgress.removeStep' : isUpdateJob ? 'wizProgress.updateStep' : 'wizProgress.installStep')}
                              </span>
                              <span className="mono">{activeJob?.progress || 0}%</span>
                           </div>
                           <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, overflow: 'hidden' }}>
                              <div style={{ width: `${activeJob?.progress || 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                           </div>
                        </div>

                        <div style={{ 
                          marginTop: 32, flex: 1, background: 'black', padding: 20, borderRadius: 12, 
                          fontFamily: 'monospace', fontSize: 12, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                           {activeJob?.logTail.map((l, i) => {
                             const lc = l.toLowerCase()
                             const color =
                               l.startsWith('[ERR]') || l.includes('VERIFY FAIL:')
                                 ? '#ff5252'
                                 : lc.includes('verify ok:')
                                   ? '#69f0ae'
                                   : '#eee'
                             return (
                               <div key={i} style={{ color, marginBottom: 4 }}>{l}</div>
                             )
                           })}
                           {activeJob?.state === 'completed' && !logHasVerifyFail && (
                             <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 10 }}>{t('wizProgress.jobOk')}</div>
                           )}
                           {activeJob?.state === 'completed' && logHasVerifyFail && (
                             <div style={{ color: '#ff8a65', fontWeight: 700, marginTop: 10 }}>{t('wizProgress.jobWarn')}</div>
                           )}
                        </div>
                     </div>
                   )}

                   {wizardStep === 4 && (
                     <div style={{ textAlign: 'center', paddingTop: 60 }}>
                        <div style={{ 
                          width: 80, height: 80, borderRadius: '50%', background: activeJob?.state === 'failed' ? 'rgba(255,82,82,0.85)' : 'var(--green)', 
                          margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'white'
                        }}>
                           {activeJob?.state === 'failed' ? '✗' : '✔'}
                        </div>
                        <h2 style={{ fontSize: 28, fontWeight: 800 }}>
                          {activeJob?.state === 'failed' ? t('wizFinish.failed') : t('wizFinish.completed')}
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 460, margin: '16px auto 40px' }}>
                          {t('wizFinish.reviewLog')}
                          {logHasVerifyOk && (
                            <span style={{ color: 'var(--green)', display: 'block', marginTop: 8, fontSize: 14 }}>
                               <span className="codicon codicon-pass" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                               {t('wizFinish.verifyOk')}
                            </span>
                          )}
                          {!logHasVerifyOk && !logHasVerifyFail && activeJob?.state === 'completed' && (
                            <span style={{ color: 'var(--orange)', display: 'block', marginTop: 8, fontSize: 14 }}>
                               <span className="codicon codicon-warning" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                               {t('wizFinish.verifyRetry')}
                            </span>
                          )}
                          {logHasVerifyFail && (
                            <span style={{ color: '#ff8a65', display: 'block', marginTop: 8, fontSize: 14 }}>
                               <span className="codicon codicon-error" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                               {t('wizFinish.verifyFail')}
                            </span>
                          )}
                          {installMethod === 'system' && activeJob?.state === 'completed' && ['node', 'python', 'go'].includes(selectedId) && (
                            <span style={{ display: 'block', marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                              {t('wizFinish.systemNote')}
                            </span>
                          )}
                        </p>
                        
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, display: 'inline-block', textAlign: 'left', minWidth: 300 }}>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{t('wizFinish.nextSteps')}</div>
                           <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <span>{t('wizFinish.stepRestart')}</span>
                              <span>{t('wizFinish.stepVerify', { cmd: suggestVerifyCmd })}</span>
                              <span>{t('wizFinish.stepBuild')}</span>
                           </div>
                        </div>
                     </div>
                   )}
                </div>

                {/* Stepper Footer */}
                <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'rgba(0,0,0,0.1)' }}>
                   {wizardStep < 3 && (
                     <button className="hp-btn" onClick={() => setShowWizard(false)}>{t('wizard.cancel')}</button>
                   )}
                   {wizardStep === 1 && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setWizardStep(2)}>{t('wizard.next')}</button>
                   )}
                   {wizardStep === 2 && (
                     <button className="hp-btn hp-btn-primary" onClick={runInstall}>{t('wizard.installNow')}</button>
                   )}
                   {wizardStep === 3 && (activeJob?.state === 'completed' || activeJob?.state === 'failed') && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setWizardStep(4)}>{t('wizard.next')}</button>
                   )}
                   {wizardStep === 4 && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setShowWizard(false)}>{t('wizard.close')}</button>
                   )}
                </div>
             </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            {t('page.selectPrompt')}
          </div>
        )}
      </main>
      {showUninstallModal && selectedRuntime && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}>
          <div style={{
            width: 'min(760px, 92%)',
            maxHeight: '85vh',
            overflowY: 'auto',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: 24,
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t('uninstall.title', { name: selectedRuntime.name })}</h3>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              {t('uninstall.desc')}
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => { setRemoveMode('runtime_only'); fetchUninstallPreview(selectedId, 'runtime_only') }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${removeMode === 'runtime_only' ? 'var(--accent)' : 'var(--border)'}`,
                  background: removeMode === 'runtime_only' ? 'rgba(124,77,255,0.12)' : 'transparent',
                  color: 'var(--text-main)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700 }}>{t('uninstall.runtimeOnly')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('uninstall.runtimeOnlyDesc')}</div>
              </button>
              <button
                onClick={() => { setRemoveMode('runtime_and_deps'); fetchUninstallPreview(selectedId, 'runtime_and_deps') }}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${removeMode === 'runtime_and_deps' ? 'var(--accent)' : 'var(--border)'}`,
                  background: removeMode === 'runtime_and_deps' ? 'rgba(124,77,255,0.12)' : 'transparent',
                  color: 'var(--text-main)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700 }}>{t('uninstall.fullClean')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('uninstall.fullCleanDesc')}</div>
              </button>
            </div>

            <div style={{ marginTop: 18, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
              {loadingUninstallPreview ? (
                <div style={{ color: 'var(--text-muted)' }}>{t('uninstall.previewLoading')}</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    {t('uninstall.distro', { distro: uninstallPreview?.distro ?? 'unknown' })}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t('uninstall.packagesToRemove')}</div>
                  {uninstallPreview?.finalPackages.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {uninstallPreview.finalPackages.map((pkg) => (
                        <span key={pkg} style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,82,82,0.35)', background: 'rgba(255,82,82,0.12)', fontSize: 12 }}>
                          {pkg}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('uninstall.noPackages')}</div>
                  )}
                  {removeMode === 'runtime_and_deps' && uninstallPreview && uninstallPreview.removableDeps.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('uninstall.extraDeps')} {uninstallPreview.removableDeps.join(', ')}
                    </div>
                  )}
                  {removeMode === 'runtime_and_deps' && uninstallPreview && uninstallPreview.blockedSharedDeps.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#ffb74d' }}>
                      {t('uninstall.sharedDeps', { deps: uninstallPreview.blockedSharedDeps.join(', ') })}
                    </div>
                  )}
                  {uninstallPreview?.note && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>{uninstallPreview.note}</div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="hp-btn" onClick={() => setShowUninstallModal(false)}>{t('uninstall.cancel')}</button>
              <button
                className="hp-btn"
                onClick={() => { setShowUninstallModal(false); void runUninstall() }}
                style={{ background: 'rgba(255,82,82,0.18)', border: '1px solid rgba(255,82,82,0.4)', color: '#ff8a80', fontWeight: 700 }}
              >
                {t('uninstall.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
