import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { RuntimeStatus, JobSummary } from '@linux-dev-home/shared'
import { assertRuntimeOk } from './runtimeContract'
import { humanizeRuntimeError } from './runtimeError'

const RUNTIME_DETAILS: Record<string, { description: string, website: string, icon: string }> = {
  node: { description: 'Node.js is a JavaScript runtime built on Chrome\'s V8 JavaScript engine. Ideal for scalable network applications.', website: 'https://nodejs.org', icon: 'symbol-method' },
  rust: { description: 'Rust is a language empowering everyone to build reliable and efficient software. Blazingly fast and memory-efficient.', website: 'https://rust-lang.org', icon: 'tools' },
  python: { description: 'Python is a programming language that lets you work quickly and integrate systems more effectively.', website: 'https://python.org', icon: 'symbol-keyword' },
  go: { description: 'Go is an open source programming language that makes it easy to build simple, reliable, and efficient software.', website: 'https://go.dev', icon: 'zap' },
  java: { description: 'Java is a high-level, class-based, object-oriented programming language that is designed to have as few implementation dependencies as possible.', website: 'https://java.com', icon: 'beaker' },
  php: { description: 'PHP is a popular general-purpose scripting language that is especially suited to web development.', website: 'https://php.net', icon: 'globe' },
  ruby: { description: 'Ruby is a dynamic, open source programming language with a focus on simplicity and productivity.', website: 'https://ruby-lang.org', icon: 'ruby' },
  dotnet: { description: '.NET is a free, cross-platform, open source developer platform for building many different types of applications.', website: 'https://dotnet.microsoft.com', icon: 'library' },
  bun: { description: 'Bun is a fast all-in-one JavaScript runtime. Bundle, transpile, install and run JavaScript & TypeScript projects.', website: 'https://bun.sh', icon: 'flame' },
  zig: { description: 'Zig is a general-purpose programming language and toolchain for maintaining robust, optimal, and reusable software.', website: 'https://ziglang.org', icon: 'circuit-board' },
  c_cpp: { description: 'C/C++ toolchain with compilers and debugger for systems programming, high-performance apps, and native libraries.', website: 'https://gcc.gnu.org', icon: 'terminal-bash' },
  matlab: { description: 'MATLAB-compatible environment powered by GNU Octave for numerical computing and matrix-heavy workflows.', website: 'https://octave.org', icon: 'graph-line' },
  dart: { description: 'Dart is a client-optimized language for building fast apps on any platform.', website: 'https://dart.dev', icon: 'symbol-namespace' },
  flutter: { description: 'Flutter is a UI toolkit for building natively compiled applications from a single codebase.', website: 'https://flutter.dev', icon: 'device-mobile' },
  julia: { description: 'Julia is a high-performance dynamic language for technical and scientific computing.', website: 'https://julialang.org', icon: 'symbol-color' },
  lua: { description: 'Lua is a lightweight embeddable scripting language used in game engines and automation.', website: 'https://www.lua.org', icon: 'symbol-variable' },
  lisp: { description: 'Common Lisp environment (SBCL) for symbolic programming and advanced macro systems.', website: 'https://www.sbcl.org', icon: 'symbol-class' },
}

const UPDATE_OUTCOME_STORAGE_KEY = 'dh:runtimes:update-outcomes:v1'

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
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([])
  const [activeJobs, setActiveJobs] = useState<JobSummary[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState<string>('node')
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [installMethod, setInstallMethod] = useState<'system' | 'local'>('system')
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
  const [sudoPassword, setSudoPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const VERSIONS_CACHE_KEY = 'dh:runtimes:versions-cache:v1'
  const VERSIONS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  const loadVersionsForRuntime = useCallback(async (runtimeId: string, resetDefault: boolean) => {
    // Check localStorage cache first
    try {
      const raw = localStorage.getItem(VERSIONS_CACHE_KEY)
      if (raw) {
        const cache = JSON.parse(raw) as Record<string, { ts: number; versions: string[] }>
        const entry = cache[runtimeId]
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
      const res = await window.dh.getAvailableVersions(runtimeId)
      assertRuntimeOk(res, 'Failed to fetch runtime versions.')
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
        cache[runtimeId] = { ts: Date.now(), versions: vs }
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
    (resetDefault: boolean) => loadVersionsForRuntime(selectedId, resetDefault),
    [selectedId, loadVersionsForRuntime],
  )

  const refreshDeps = useCallback(async () => {
    try {
      const res = await window.dh.checkDependencies(selectedId)
      assertRuntimeOk(res, 'Failed to check runtime dependencies.')
      setDependencies(res.dependencies)
    } catch (e) {
      setDependencies([])
      setErrorMessage(humanizeRuntimeError(e))
    }
  }, [selectedId])

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true)
    setErrorMessage(null)
    try {
      const res = await window.dh.runtimeStatus() as { ok: boolean; runtimes: RuntimeStatus[]; error?: string }
      if (res.ok) {
        setRuntimes(res.runtimes)
      } else {
        setErrorMessage(humanizeRuntimeError(res.error))
      }
      const jobs = await window.dh.jobsList() as JobSummary[]
      setActiveJobs(jobs.filter((j) => j.kind.startsWith('runtime_') || j.kind === 'install_deps'))
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    if (showWizard && wizardStep === 2) void refreshDeps()
    
    const t = setInterval(() => {
      void refreshStatus()
      if (showWizard && wizardStep === 2) void refreshDeps()
    }, 3000)
    return () => clearInterval(t)
  }, [refreshStatus, refreshDeps, showWizard, wizardStep])

  // Auto-refresh status + deps when the active job finishes so the user
  // doesn't have to manually trigger a recheck after install/uninstall.
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

  const selectedRuntime = useMemo(() => runtimes.find(r => r.id === selectedId), [runtimes, selectedId])
  const activeJob = useMemo(() => {
    const jobsForRuntime = activeJobs.filter((j) => {
      const runtimeId = (j as JobSummary & { runtimeId?: string }).runtimeId
      if (runtimeId) return runtimeId === selectedId
      return j.logTail.some((line) => line.includes(`runtime=${selectedId}`) || line.includes(`for ${selectedId}`))
    })
    return jobsForRuntime[jobsForRuntime.length - 1]
  }, [activeJobs, selectedId])
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
    void loadVersionsForRuntime(selectedId, true)
  }, [selectedId, loadVersionsForRuntime])

  const startInstall = async (id: string) => {
    setSelectedId(id)
    setShowWizard(true)
    setWizardStep(1)
    void loadVersionsForRuntime(id, true)
  }

  const runInstall = async () => {
    setWizardStep(3)
    await window.dh.jobStart({ 
      kind: 'runtime_install', 
      runtimeId: selectedId,
      method: installMethod,
      version: selectedVersion,
      addToPath,
      sudoPassword,
    })
  }

  const runUpdate = async () => {
    setShowWizard(true)
    setWizardStep(3)
    await window.dh.jobStart({
      kind: 'runtime_update',
      runtimeId: selectedId,
      method: installMethod,
      sudoPassword,
    })
  }

  const runUninstall = async () => {
    setWizardStep(3)
    await window.dh.jobStart({
      kind: 'runtime_uninstall',
      runtimeId: selectedId,
      method: installMethod,
      removeMode,
      sudoPassword,
    })
  }

  const openUninstallModal = async () => {
    setRemoveMode('runtime_only')
    setShowUninstallModal(true)
  }

  useEffect(() => {
    if (!showUninstallModal || !selectedRuntime?.installed) return
    setLoadingUninstallPreview(true)
    void window.dh.runtimeUninstallPreview({ runtimeId: selectedId, removeMode })
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
  }, [showUninstallModal, selectedId, removeMode, selectedRuntime?.installed])

  const cancelInstall = async () => {
    if (activeJob) {
      await window.dh.jobCancel({ id: activeJob.id })
      setShowWizard(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 120px)', background: 'var(--bg-panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}>
      {/* Sidebar List */}
      <aside style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-muted)' }}>RUNTIMES</div>
          <button 
            onClick={() => void refreshStatus()}
            className="hp-btn-icon" 
            title="Refresh Status"
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
                  {r.installed ? r.version : 'Not installed'}
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
                      {selectedRuntime.installed ? 'Installed' : 'Available'}
                    </span>
                    {selectedRuntime.installed && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Version {selectedRuntime.version}</span>}
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
                   {installInProgress && !isUninstallJob && !isUpdateJob ? 'Installing...' : 'Install Version'}
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
                       {isUpdateJob ? 'Updating...' : (effectiveUpdateOutcome === 'already_latest' ? 'Already Latest' : 'Update Current')}
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
                       Remove
                     </button>
                   </>
                 )}
              </div>
            </div>

            <div style={{ marginTop: 48 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Description</h3>
              <p style={{ fontSize: 16, color: 'var(--text-main)', lineHeight: 1.6, opacity: 0.8 }}>
                {RUNTIME_DETAILS[selectedId]?.description}
              </p>
              <a 
                href="#" 
                onClick={(e) => { e.preventDefault(); window.dh.openExternal(RUNTIME_DETAILS[selectedId]?.website || '') }}
                style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 600, marginTop: 12, display: 'inline-block' }}
              >
                Visit Official Website →
              </a>
            </div>

            {selectedRuntime.installed && selectedRuntime.allVersions && (
              <div style={{ marginTop: 40 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Detected Installations</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {selectedRuntime.allVersions.map((v, i) => (
                    <div key={i} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border)' 
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Version {v.version}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>{v.path}</div>
                      </div>
                      {v.path === selectedRuntime.path && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(0,230,118,0.3)', background: 'rgba(0,230,118,0.05)' }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                  ))}
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
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{selectedRuntime?.name} Setup</h2>
             </div>

             <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Stepper Header */}
                <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)' }}>
                   {[
                     { step: 1, label: 'Configuration' },
                     { step: 2, label: 'Dependencies' },
                     { step: 3, label: 'Installation' },
                     { step: 4, label: 'Finish' }
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
                        <h3 style={{ marginTop: 0 }}>Installation Settings</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>Choose how you want to install {selectedRuntime?.name} on your system.</p>
                        
                        <div className="hp-card" style={{ marginBottom: 20 }}>
                           <div style={{ fontWeight: 600, marginBottom: 12 }}>Installation Method</div>
                           <div style={{ display: 'flex', gap: 12 }}>
                              <button 
                                onClick={() => setInstallMethod('system')}
                                style={{ 
                                  flex: 1, padding: 16, borderRadius: 12, border: `2px solid ${installMethod === 'system' ? 'var(--accent)' : 'var(--border)'}`,
                                  background: installMethod === 'system' ? 'rgba(124, 77, 255, 0.1)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left'
                                }}
                              >
                                 <div style={{ fontWeight: 700, fontSize: 14 }}>System Package Manager</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Uses DNF / APT to install globally. Recommended.</div>
                              </button>
                              <button 
                                onClick={() => setInstallMethod('local')}
                                style={{ 
                                  flex: 1, padding: 16, borderRadius: 12, border: `2px solid ${installMethod === 'local' ? 'var(--accent)' : 'var(--border)'}`,
                                  background: installMethod === 'local' ? 'rgba(124, 77, 255, 0.1)' : 'transparent', color: 'var(--text-main)', cursor: 'pointer', textAlign: 'left'
                                }}
                              >
                                 <div style={{ fontWeight: 700, fontSize: 14 }}>Isolated Script (Local)</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Installs to user scope without sudo. Safer, and can auto-update PATH.</div>
                              </button>
                           </div>
                        </div>

                        <div className="hp-card" style={{ marginBottom: 20 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 12 }}>
                             <div style={{ fontWeight: 600 }}>Target Version</div>
                             <button
                               type="button"
                               className="hp-btn-icon"
                               title="Refresh version list from the network (new releases appear here without an app update)"
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
                               Refresh
                             </button>
                           </div>
                           <select 
                             className="hp-input" 
                             style={{ width: '100%', opacity: versionsLoading && availableVersions.length === 0 ? 0.6 : 1 }} 
                             value={selectedVersion} 
                             disabled={versionsLoading && availableVersions.length === 0}
                             onChange={(e) => setSelectedVersion(e.target.value)}
                           >
                             {availableVersions.map(v => <option key={v} value={v}>{v}</option>)}
                           </select>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                             Lists are loaded from upstream APIs where possible; use Refresh after a new release if you do not change language.
                           </div>
                        </div>

                        <div className="hp-card">
                           <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={addToPath} 
                                onChange={(e) => setAddToPath(e.target.checked)} 
                              />
                              <div>
                                 <div style={{ fontWeight: 600 }}>Add to system PATH</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Automatically configure environment variables for this runtime.</div>
                              </div>
                           </label>
                        </div>

                        <div className="hp-card">
                           <div style={{ fontWeight: 600, marginBottom: 6 }}>Sudo password</div>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                             Required for system-wide installs (apt / dnf / pacman). Leave blank if you have passwordless sudo.
                           </div>
                           <input
                             type="password"
                             placeholder="Enter sudo password…"
                             value={sudoPassword}
                             onChange={(e) => setSudoPassword(e.target.value)}
                             style={{ width: '100%', boxSizing: 'border-box' }}
                             className="hp-input"
                             autoComplete="current-password"
                           />
                        </div>
                     </div>
                   )}

                   {wizardStep === 2 && (
                     <div>
                        <h3 style={{ marginTop: 0 }}>System Dependencies</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: 32 }}>We found the following requirements for building/running {selectedRuntime?.name}.</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                           {dependencies.length > 0 ? dependencies.map(d => (
                             <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                <span style={{ fontWeight: 600 }}>{d.name}</span>
                                <span style={{ color: d.ok ? 'var(--green)' : 'var(--orange)', fontSize: 12, fontWeight: 700 }}>{d.status}</span>
                             </div>
                           )) : (
                             <div style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>Checking requirements...</div>
                           )}
                        </div>
                        
                        {!selectedRuntime?.installed && (
                          <div style={{ marginTop: 24, padding: 16, background: 'rgba(255, 152, 0, 0.1)', borderRadius: 8, border: '1px solid rgba(255, 152, 0, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div style={{ fontSize: 13 }}>
                                💡 <strong>Note:</strong> Some missing headers might be required for building.
                             </div>
                             <button 
                              onClick={() => window.dh.jobStart({ kind: 'install_deps', runtimeId: selectedId, sudoPassword })}
                               className="hp-btn" 
                               style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '6px 12px', fontSize: 11, fontWeight: 700 }}
                             >
                                Fix Missing Dependencies
                             </button>
                          </div>
                        )}
                     </div>
                   )}

                   {wizardStep === 3 && (
                     <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                           <h3 style={{ marginTop: 0 }}>{isUninstallJob ? 'Removing' : isUpdateJob ? 'Updating' : 'Installing'} {selectedRuntime?.name}</h3>
                           {activeJob?.state === 'running' && (
                             <button 
                               onClick={cancelInstall}
                               style={{ background: 'rgba(255, 82, 82, 0.1)', color: '#ff5252', border: '1px solid rgba(255, 82, 82, 0.2)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                             >
                               Cancel Installation
                             </button>
                           )}
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>
                          {isUninstallJob ? 'Please wait while we remove runtime files and clean shared dependencies safely...' : isUpdateJob ? 'Please wait while we update runtime packages and verify the version...' : 'Please wait while we set up your environment...'}
                        </p>

                        <div style={{ marginTop: 24 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>
                                {activeJob?.progress === 100 ? 'Verification...' : (isUninstallJob ? 'Removing packages...' : isUpdateJob ? 'Updating packages...' : 'Downloading & Extracting...')}
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
                           {activeJob?.logTail.map((l, i) => (
                             <div key={i} style={{ color: l.startsWith('[ERR]') ? '#ff5252' : '#eee', marginBottom: 4 }}>{l}</div>
                           ))}
                           {activeJob?.state === 'completed' && <div style={{ color: 'var(--green)', fontWeight: 700, marginTop: 10 }}>✔ Installation complete.</div>}
                        </div>
                     </div>
                   )}

                   {wizardStep === 4 && (
                     <div style={{ textAlign: 'center', paddingTop: 60 }}>
                        <div style={{ 
                          width: 80, height: 80, borderRadius: '50%', background: 'var(--green)', 
                          margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'white'
                        }}>
                           ✔
                        </div>
                        <h2 style={{ fontSize: 28, fontWeight: 800 }}>Successfully Installed!</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: 16, maxWidth: 400, margin: '16px auto 40px' }}>
                          {selectedRuntime?.name} is now ready for use. 
                          {activeJob?.logTail.some(l => l.includes('Smoke test passed')) ? (
                            <span style={{ color: 'var(--green)', display: 'block', marginTop: 8, fontSize: 14 }}>
                               <span className="codicon codicon-pass" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                               Post-install verification passed.
                            </span>
                          ) : (
                            <span style={{ color: 'var(--orange)', display: 'block', marginTop: 8, fontSize: 14 }}>
                               <span className="codicon codicon-warning" style={{ verticalAlign: 'middle', marginRight: 6 }} />
                               Verification skipped or pending shell restart.
                            </span>
                          )}
                        </p>
                        
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 20, borderRadius: 12, display: 'inline-block', textAlign: 'left', minWidth: 300 }}>
                           <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>NEXT STEPS:</div>
                           <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <span>• Restart any open terminals</span>
                              <span>• Try running <code>{selectedId} --version</code></span>
                              <span>• Start building something amazing!</span>
                           </div>
                        </div>
                     </div>
                   )}
                </div>

                {/* Stepper Footer */}
                <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12, background: 'rgba(0,0,0,0.1)' }}>
                   {wizardStep < 3 && (
                     <button className="hp-btn" onClick={() => setShowWizard(false)}>Cancel</button>
                   )}
                   {wizardStep === 1 && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setWizardStep(2)}>Next</button>
                   )}
                   {wizardStep === 2 && (
                     <button className="hp-btn hp-btn-primary" onClick={runInstall}>Install Now</button>
                   )}
                   {wizardStep === 3 && (activeJob?.state === 'completed' || activeJob?.state === 'failed') && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setWizardStep(4)}>Next</button>
                   )}
                   {wizardStep === 4 && (
                     <button className="hp-btn hp-btn-primary" onClick={() => setShowWizard(false)}>Close Wizard</button>
                   )}
                </div>
             </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a runtime to see details.
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
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Confirm Remove {selectedRuntime.name}</h3>
            <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: 13 }}>
              Choose how much cleanup to apply. Preview reflects detected distro and package mapping.
            </p>

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button
                onClick={() => setRemoveMode('runtime_only')}
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
                <div style={{ fontWeight: 700 }}>Remove runtime only</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Removes language package only.</div>
              </button>
              <button
                onClick={() => setRemoveMode('runtime_and_deps')}
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
                <div style={{ fontWeight: 700 }}>Remove + autoremove deps</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Also removes safe non-shared dependencies.</div>
              </button>
            </div>

            <div style={{ marginTop: 18, padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
              {loadingUninstallPreview ? (
                <div style={{ color: 'var(--text-muted)' }}>Preparing removal preview...</div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Distro: <strong>{uninstallPreview?.distro ?? 'unknown'}</strong>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Packages to remove now:</div>
                  {uninstallPreview?.finalPackages.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {uninstallPreview.finalPackages.map((pkg) => (
                        <span key={pkg} style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid rgba(255,82,82,0.35)', background: 'rgba(255,82,82,0.12)', fontSize: 12 }}>
                          {pkg}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No package-managed items detected for this runtime.</div>
                  )}
                  {removeMode === 'runtime_and_deps' && uninstallPreview && uninstallPreview.removableDeps.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                      Extra safe deps included: {uninstallPreview.removableDeps.join(', ')}
                    </div>
                  )}
                  {removeMode === 'runtime_and_deps' && uninstallPreview && uninstallPreview.blockedSharedDeps.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#ffb74d' }}>
                      Shared dependencies will NOT be removed (used by other runtimes): {uninstallPreview.blockedSharedDeps.join(', ')}.
                      Runtime removal will continue safely without deleting them.
                    </div>
                  )}
                  {uninstallPreview?.note && (
                    <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>{uninstallPreview.note}</div>
                  )}
                </>
              )}
            </div>

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="hp-btn" onClick={() => setShowUninstallModal(false)}>Cancel</button>
              <button
                className="hp-btn"
                onClick={() => { setShowUninstallModal(false); void runUninstall() }}
                style={{ background: 'rgba(255,82,82,0.18)', border: '1px solid rgba(255,82,82,0.4)', color: '#ff8a80', fontWeight: 700 }}
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
