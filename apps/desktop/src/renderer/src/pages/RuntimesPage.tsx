import type { ReactElement } from 'react'
import { useEffect, useState, useCallback, useMemo } from 'react'
import type { RuntimeStatus, RuntimeStatusResponse, JobSummary } from '@linux-dev-home/shared'

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

  const refreshDeps = useCallback(async () => {
    const res = await window.dh.checkDependencies(selectedId)
    setDependencies(res)
  }, [selectedId])

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const res = await window.dh.runtimeStatus() as RuntimeStatusResponse
      setRuntimes(res.runtimes)
      const jobs = await window.dh.jobsList() as JobSummary[]
      setActiveJobs(jobs.filter(j => j.kind.startsWith('install_')))
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

  const selectedRuntime = useMemo(() => runtimes.find(r => r.id === selectedId), [runtimes, selectedId])
  const activeJob = useMemo(() => {
    const jobsForRuntime = activeJobs.filter(j => j.kind === `install_${selectedId}`)
    return jobsForRuntime[jobsForRuntime.length - 1]
  }, [activeJobs, selectedId])
  const installInProgress = activeJob?.state === 'running'

  const startInstall = async (id: string) => {
    setSelectedId(id)
    setShowWizard(true)
    setWizardStep(1)
  }

  const runInstall = async () => {
    setWizardStep(3)
    await window.dh.jobStart({ 
      kind: 'runtime_install', 
      runtimeId: selectedId,
      method: installMethod 
    })
  }

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
                   disabled={selectedRuntime.installed || installInProgress}
                   style={{ 
                     padding: '12px 24px', 
                     borderRadius: 12, 
                     border: 'none', 
                     background: selectedRuntime.installed ? 'rgba(255,255,255,0.05)' : 'var(--accent)',
                     color: 'white',
                     fontWeight: 700,
                     cursor: (selectedRuntime.installed || installInProgress) ? 'default' : 'pointer',
                     opacity: (selectedRuntime.installed || installInProgress) ? 0.6 : 1,
                     boxShadow: selectedRuntime.installed ? 'none' : '0 4px 15px rgba(124, 77, 255, 0.3)'
                   }}
                 >
                   {selectedRuntime.installed ? 'Up to date' : installInProgress ? 'Installing...' : 'Get / Install'}
                 </button>
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

            {!activeJob && selectedRuntime.installed && (
              <div style={{ marginTop: 40, padding: 24, background: 'rgba(0,230,118,0.05)', borderRadius: 16, border: '1px solid rgba(0,230,118,0.1)' }}>
                <h4 style={{ margin: 0, color: 'var(--green)', fontSize: 16, fontWeight: 700 }}>Runtime Active</h4>
                <p style={{ margin: '8px 0 0 0', fontSize: 14, color: 'var(--text-muted)' }}>
                  This environment is correctly configured and accessible at:
                </p>
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>
                  {selectedRuntime.path}
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
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Installs to ~/.lumina without sudo. Safer but manual paths.</div>
                              </button>
                           </div>
                        </div>

                        <div className="hp-card" style={{ marginBottom: 20 }}>
                           <div style={{ fontWeight: 600, marginBottom: 8 }}>Target Location</div>
                           <div style={{ display: 'flex', gap: 8 }}>
                              <input className="hp-input" style={{ flex: 1 }} value={installMethod === 'system' ? '/usr/bin' : '~/.lumina/runtimes'} readOnly />
                              <button className="hp-btn" disabled>Browse...</button>
                           </div>
                        </div>

                        <div className="hp-card">
                           <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked readOnly />
                              <div>
                                 <div style={{ fontWeight: 600 }}>Add to system PATH</div>
                                 <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Automatically configure environment variables for this runtime.</div>
                              </div>
                           </label>
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
                               onClick={() => window.dh.jobStart({ kind: 'install_deps' })}
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
                           <h3 style={{ marginTop: 0 }}>Installing {selectedRuntime?.name}</h3>
                           {activeJob?.state === 'running' && (
                             <button 
                               onClick={cancelInstall}
                               style={{ background: 'rgba(255, 82, 82, 0.1)', color: '#ff5252', border: '1px solid rgba(255, 82, 82, 0.2)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                             >
                               Cancel Installation
                             </button>
                           )}
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>Please wait while we set up your environment...</p>

                        <div style={{ marginTop: 24 }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                              <span style={{ fontWeight: 700, fontSize: 14 }}>{activeJob?.progress === 100 ? 'Verification...' : 'Downloading & Extracting...'}</span>
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
                          {selectedRuntime?.name} version {selectedRuntime?.version} is now ready for use in your development projects.
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
    </div>
  )
}
