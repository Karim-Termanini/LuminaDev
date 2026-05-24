/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ComposeProfile,
  type ContainerRow,
  type HostMetricsResponse,
  parseStoredActiveProfile,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { humanizeProfileError } from './profileError'

import './DashboardPage.css'

// Mock data generators
function generateActivityData(profileName: string): Array<{ label: string; cpu: number; ram: number }> {
  const seed = profileName.charCodeAt(0) + profileName.charCodeAt(profileName.length - 1)
  const periods = ['12h ago', '10h ago', '8h ago', '6h ago', 'now']
  return periods.map((label, i) => ({
    label,
    cpu: Math.max(10, Math.min(90, 30 + seed + i * 5 + Math.sin(seed + i) * 20)),
    ram: Math.max(15, Math.min(85, 40 + seed * 0.5 + i * 3 + Math.cos(seed + i) * 15)),
  }))
}

function generateResourceAllocation(profileName: string) {
  const seed = profileName.charCodeAt(0) % 3
  const allocations = [
    { label: 'Running', value: 65, color: 'var(--green)' },
    { label: 'Exited', value: 20, color: 'var(--text-muted)' },
    { label: 'Paused', value: 15, color: 'var(--yellow)' },
  ]
  return allocations.map((a, i) => ({
    ...a,
    value: Math.max(5, a.value + ((seed * i) % 10) - 5),
  }))
}

function generateEventFeed(profileName: string): Array<{ id: string; icon: string; color: string; title: string; time: string }> {
  const now = Date.now()
  const seeds = profileName.split('').map(c => c.charCodeAt(0)).reduce((a, b) => a + b, 0)
  const events = [
    { icon: 'check', color: 'var(--green)', title: 'Containers initialized', timeMs: now - 30000 },
    { icon: 'plug', color: 'var(--accent)', title: 'Port 5432 (PostgreSQL) exposed', timeMs: now - 120000 },
    { icon: 'database', color: 'var(--blue)', title: 'Cache warmed up', timeMs: now - 300000 },
    { icon: 'server', color: 'var(--accent)', title: 'Profile activated', timeMs: now - 600000 },
  ]
  return events
    .sort(() => (seeds % 2) - 0.5)
    .map((e, i) => ({
      id: `${profileName}-event-${i}`,
      icon: e.icon,
      color: e.color,
      title: e.title,
      time: formatTime(e.timeMs),
    }))
}

function generateServices(profileName: string): Array<{ id: string; name: string; status: 'running' | 'pending' | 'idle'; uptime: string }> {
  const servicesByProfile: Record<string, string[]> = {
    'web-dev': ['Nginx', 'API Server', 'Database'],
    'data-science': ['Jupyter Lab', 'PostgreSQL', 'Redis'],
    'ai-ml': ['PyTorch Runtime', 'Jupyter', 'GPU Monitor'],
    'docs': ['Jekyll', 'Search Index'],
  }
  const services = servicesByProfile[profileName] || ['Default Service']
  return services.map((name, i) => ({
    id: `${profileName}-svc-${i}`,
    name,
    status: i === 0 ? 'running' : i === 1 ? 'pending' : 'idle',
    uptime: ['4h 32m', '2h 15m', '1h 08m'][i % 3] || '0h',
  }))
}

function formatTime(ms: number): string {
  const ago = (Date.now() - ms) / 1000
  if (ago < 60) return 'Just now'
  if (ago < 3600) return `${Math.floor(ago / 60)}m ago`
  if (ago < 86400) return `${Math.floor(ago / 3600)}h ago`
  return `${Math.floor(ago / 86400)}d ago`
}

interface ProfileDef {
  name: ComposeProfile
  title: string
  description: string
  icon: string
  accent: string
  status: 'live' | 'planned'
}

const PRESET_PROFILES: ProfileDef[] = [
  { name: 'web-dev', title: 'Web Development', description: 'Dockerized web stack with nginx placeholder and hot-reload friendly layout.', icon: 'globe', accent: 'var(--accent)', status: 'live' },
  { name: 'data-science', title: 'Data Science', description: 'Pandas, NumPy, Matplotlib & Jupyter Lab. Standard analytics stack.', icon: 'graph', accent: 'var(--green)', status: 'live' },
  { name: 'ai-ml', title: 'AI/ML Local', description: 'PyTorch + Jupyter environment. Ready for CUDA workloads (requires host drivers).', icon: 'hubot', accent: 'var(--blue)', status: 'live' },
  { name: 'mobile', title: 'Mobile App Dev', description: 'React Native / Flutter environment stub.', icon: 'device-mobile', accent: 'var(--green)', status: 'planned' },
  { name: 'game-dev', title: 'Game Development', description: 'Godot/Unity/Unreal minimal engine stub.', icon: 'play-circle', accent: 'var(--yellow)', status: 'planned' },
  { name: 'infra', title: 'Infra / K8s', description: 'Local minikube/k3d or Terraform runner stub.', icon: 'server-environment', accent: 'var(--purple)', status: 'planned' },
  { name: 'desktop-gui', title: 'Desktop Qt/GTK', description: 'Native desktop application build environment.', icon: 'window', accent: 'var(--cyan)', status: 'planned' },
  { name: 'docs', title: 'Docs / Writing', description: 'Jekyll/Hugo/Docusaurus writing environment.', icon: 'book', accent: 'var(--red)', status: 'live' },
  { name: 'empty', title: 'Empty Minimal', description: 'Clean slate alpine image for general scripting.', icon: 'blank', accent: 'var(--text-muted)', status: 'live' },
]

interface Toast {
  type: 'success' | 'error'
  message: string
}

export function DashboardMainPage(): ReactElement {
  const [docker, setDocker] = useState<{ ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null>(null)
  const [snap, setSnap] = useState<HostMetricsResponse | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [isSwitching, setIsSwitching] = useState(false)
  const [activeProfile, setActiveProfile] = useState<ComposeProfile | null>(null)
  const [selectedProfileName, setSelectedProfileName] = useState<ComposeProfile | null>(null)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)

  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [installedEditors, setInstalledEditors] = useState<Array<{ name: string; cmd: string }>>([])
  const [selectedEditorCmd, setSelectedEditorCmd] = useState<string>('')
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false)
  const [createProjectStep, setCreateProjectStep] = useState(1)
  const [createProjectName, setCreateProjectName] = useState('')
  const [createProjectPythonVer, setCreateProjectPythonVer] = useState('latest')
  const [createProjectPostgresVer, setCreateProjectPostgresVer] = useState('16')
  const [createProjectDeps, setCreateProjectDeps] = useState<Record<string, string>>({})
  const [createProjectAutoInstall, setCreateProjectAutoInstall] = useState(true)
  const [createProjectNotebook, setCreateProjectNotebook] = useState(true)
  const [createProjectMainPy, setCreateProjectMainPy] = useState(false)
  const [isScaffolding, setIsScaffolding] = useState(false)
  const [scaffoldProgress, setScaffoldProgress] = useState(0)
  const [scaffoldStatusText, setScaffoldStatusText] = useState('Initializing...')
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const logsContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let unlisten: () => void;
    listen<string>('project-install-log', (event) => {
      setInstallLogs(prev => {
        const next = [...prev.slice(-49), event.payload]
        return next
      })
    }).then(fn => { unlisten = fn })
    return () => { if (unlisten) unlisten() }
  }, [])

  useEffect(() => {
    let interval: any;
    if (isScaffolding) {
      setScaffoldProgress(5)
      interval = setInterval(() => {
        setScaffoldProgress(prev => {
          if (prev >= 90) return prev
          const increment = Math.max(0.5, (90 - prev) / 10)
          return prev + increment
        })
      }, 800)
    } else {
      setScaffoldProgress(100)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [isScaffolding])

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [installLogs])

  const refresh = useCallback(async () => {
    try {
      const d = (await window.dh.dockerList()) as { ok: true; rows: ContainerRow[] } | { ok: false; error: string }
      setDocker(d)
    } catch (e) {
      setDocker({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    try {
      const m = (await window.dh.metrics()) as HostMetricsResponse & { ok: boolean; error?: string }
      if (m.ok) {
        setSnap(m)
      }
    } catch {
      // silently fail, keep last metrics
    }
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as { ok: boolean; data?: unknown }
      setActiveProfile(ap.ok ? parseStoredActiveProfile(ap.data) : null)
    } catch {
      /* keep last known */
    }
  
    if (selectedProfileName) {
      window.dh.storeGet({ key: `project_dir_${selectedProfileName}` } as any).then(async (p: any) => {
        if (p.ok && p.data && typeof p.data === 'string') {
          try {
            const res = await invoke('ipc_invoke', { channel: 'dh:fs:exists', payload: { path: p.data } }) as any;
            if (res.ok && res.exists) {
              setProjectPath(p.data);
            } else {
              setProjectPath(null);
              await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: null } as any);
            }
          } catch {
            setProjectPath(p.data);
          }
        }
        else setProjectPath(null)
      }).catch(() => {})
    }
    
    invoke('ipc_invoke', { channel: 'dh:editor:list' }).then((res: any) => {
      if (res.ok && res.editors) {
        setInstalledEditors(res.editors)
        if (res.editors.length > 0) setSelectedEditorCmd(res.editors[0].cmd)
      }
    }).catch(() => {})

  }, [selectedProfileName])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 4000)
    return () => clearInterval(id)
  }, [refresh])

  // Load selected profile from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-selected-profile')
    if (saved && PRESET_PROFILES.some(p => p.name === saved)) {
      setSelectedProfileName(saved as ComposeProfile)
    } else {
      setSelectedProfileName(activeProfile || PRESET_PROFILES[0].name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save selected profile to localStorage
  useEffect(() => {
    if (selectedProfileName) {
      localStorage.setItem('dashboard-selected-profile', selectedProfileName)
    }
  }, [selectedProfileName])

  
  const handleLinkProject = async () => {
     if (!selectedProfileName) return
     try {
       const selected = await window.dh.selectFolder()
       if (selected && typeof selected === 'string') {
         setProjectPath(selected)
         await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: selected } as any)
         setToast({ type: 'success', message: `Linked workspace folder!` })
       }
     } catch { /* empty */ }
  }

  const handleOpenEditor = async () => {
     if (!projectPath || !selectedEditorCmd) return
     const res = await invoke('ipc_invoke', { channel: 'dh:editor:open', payload: { path: projectPath, cmd: selectedEditorCmd } }) as any
     if (!res.ok) {
        setToast({ type: 'error', message: res.error || 'Failed to open IDE' })
     }
  }

  const submitCreateProject = async () => {
     if (!selectedProfileName || !createProjectName.trim()) return
     const name = createProjectName.trim()
     const path = `~/LuminaProjects/${selectedProfileName}/${name}`
     
     setIsScaffolding(true)
     setInstallLogs([])
     setToast({ type: 'success', message: `Scaffolding ${name}...` })
     
     if (selectedProfileName === 'data-science') {
       const res = await invoke('ipc_invoke', { 
         channel: 'dh:project:scaffold', 
         payload: { 
           path, 
           template: 'data-science',
           options: {
             dependencies: createProjectDeps,
             createNotebook: createProjectNotebook,
             createMainScript: createProjectMainPy,
           }
         } 
       }) as any
       
       if (res.ok) {
          setProjectPath(res.path)
          await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
          await window.dh.storeSet({ key: `python_version_${selectedProfileName}`, data: createProjectPythonVer } as any)
          await window.dh.storeSet({ key: `postgres_version_${selectedProfileName}`, data: createProjectPostgresVer } as any)
          
          if (createProjectAutoInstall) {
            setToast({ type: 'success', message: 'Installing dependencies in background...' })
            setScaffoldStatusText('Starting Docker Environment...')
            // Ensure the containers are running so we can install deps
            await invoke('ipc_invoke', { channel: 'dh:profile:switch', payload: { to: selectedProfileName } })
            setScaffoldStatusText('Installing Dependencies...')
            const r: any = await invoke('ipc_invoke', { channel: 'dh:project:install_deps', payload: { projectName: name } })
            if (r.ok) {
              setToast({ type: 'success', message: 'Dependencies installed successfully!' })
              setScaffoldStatusText('Finished!')
            } else {
              setToast({ type: 'error', message: 'Failed to install dependencies' })
              setScaffoldStatusText('Failed.')
            }
          } else {
            setToast({ type: 'success', message: `Created project: ${name}` })
          }
          
          setScaffoldProgress(100)
          setTimeout(() => {
            setIsScaffolding(false)
            setCreateProjectModalOpen(false)
            setCreateProjectStep(1)
            setCreateProjectName('')
          }, 600)
       } else {
          setIsScaffolding(false)
          setToast({ type: 'error', message: res.error || 'Failed to scaffold project' })
       }
     } else if (selectedProfileName === 'web-dev') {
       const res = await invoke('ipc_invoke', { 
         channel: 'dh:project:scaffold', 
         payload: { 
           path, 
           template: 'web-dev',
           options: {
             dependencies: createProjectDeps,
             devDependencies: {}
           }
         } 
       }) as any
       
       if (res.ok) {
          setProjectPath(res.path)
          await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
          await window.dh.storeSet({ key: `node_version_${selectedProfileName}`, data: createProjectPythonVer } as any) // Reusing the same state variable for now
          await window.dh.storeSet({ key: `postgres_version_${selectedProfileName}`, data: createProjectPostgresVer } as any)
          
          if (createProjectAutoInstall) {
            setToast({ type: 'success', message: 'Installing dependencies in background...' })
            setScaffoldStatusText('Starting Docker Environment...')
            // Ensure the containers are running so we can install deps
            await invoke('ipc_invoke', { channel: 'dh:profile:switch', payload: { to: selectedProfileName } })
            setScaffoldStatusText('Installing Dependencies...')
            const r: any = await invoke('ipc_invoke', { channel: 'dh:project:install_deps', payload: { projectName: name, template: 'web-dev' } })
            if (r.ok) {
              setToast({ type: 'success', message: 'Dependencies installed successfully!' })
              setScaffoldStatusText('Finished!')
            } else {
              setToast({ type: 'error', message: 'Failed to install dependencies' })
              setScaffoldStatusText('Failed.')
            }
          } else {
            setToast({ type: 'success', message: `Created project: ${name}` })
          }
          
          setScaffoldProgress(100)
          setTimeout(() => {
            setIsScaffolding(false)
            setCreateProjectModalOpen(false)
            setCreateProjectStep(1)
            setCreateProjectName('')
          }, 600)
       } else {
          setIsScaffolding(false)
          setToast({ type: 'error', message: res.error || 'Failed to scaffold project' })
       }
     } else {
       // Fallback for non-data-science templates
       const res = await invoke('ipc_invoke', { channel: 'dh:project:ensure_dir', payload: { path } }) as any
       if (res.ok) {
          setProjectPath(res.path)
          await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: res.path } as any)
          setToast({ type: 'success', message: `Created project: ${name}` })
          setIsScaffolding(false)
          setCreateProjectModalOpen(false)
          setCreateProjectStep(1)
          setCreateProjectName('')
       } else {
          setIsScaffolding(false)
          setToast({ type: 'error', message: res.error || 'Failed to create project' })
       }
     }
  }


  function handleConfirmSwitch(): void {
    if (!selectedProfileName) return
    setConfirmModalOpen(false)
    setIsSwitching(true)
    const isRestart = activeProfile === selectedProfileName
    setToast({ type: 'success', message: isRestart ? `Restarting ${selectedProfileName}…` : `Switching to ${selectedProfileName}…` })
    
    // If it's a restart, we switch from activeProfile to activeProfile
    window.dh.profileSwitch({ from: activeProfile ?? undefined, to: selectedProfileName }).then((r) => {

      setIsSwitching(false)
      if (r.ok) {
        window.dh.storeSet({ key: 'active_profile', data: selectedProfileName }).then(() => {
          setActiveProfile(selectedProfileName)
          setToast({ type: 'success', message: `Switched to ${selectedProfileName}` })
          void refresh()
          setTimeout(() => setToast(null), 2500)
        }).catch(() => {
          setActiveProfile(selectedProfileName)
          setToast({ type: 'success', message: `Switched to ${selectedProfileName}` })
        })
      } else {
        const errMsg = r.error ?? r.log ?? 'Unknown error'
        setToast({ type: 'error', message: humanizeProfileError(errMsg) })
      }
    }).catch((e) => {
      setIsSwitching(false)
      const errMsg = e instanceof Error ? e.message : String(e)
      setToast({ type: 'error', message: errMsg })
    })
  }

  const selectedProfile = PRESET_PROFILES.find((p) => p.name === selectedProfileName)
  const m = snap?.metrics
  const ramUsedPct = useMemo(() => {
    if (!m || m.totalMemMb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100))
  }, [m])
  const diskUsedPct = useMemo(() => {
    if (!m || m.diskTotalGb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100))
  }, [m])
  const activeContainers = useMemo(() => {
    if (!docker || !docker.ok || !selectedProfileName) return []
    return docker.rows.filter((c) => c.name.includes(selectedProfileName))
  }, [docker, selectedProfileName])

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
            maxWidth: 320,
          }}
        >
          <span className={`codicon ${toast.type === 'success' ? 'codicon-check' : 'codicon-error'}`} style={{ fontSize: 16, flexShrink: 0 }} />
          <span style={{ flex: 1, wordBreak: 'break-word' }}>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.7, flexShrink: 0, marginLeft: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
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
              <span className={`codicon codicon-${selectedProfile.icon}`} style={{ fontSize: 48, color: selectedProfile.accent }} />
              <h2 style={{ margin: '16px 0 8px', fontSize: 28, fontWeight: 700 }}>{selectedProfile.title}</h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, maxWidth: 600 }}>{selectedProfile.description}</p>
            </div>

            {/* Initialize Button */}
            <div style={{ marginTop: 24 }}>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                disabled={selectedProfile.status === 'planned' || isSwitching || activeProfile === selectedProfileName}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedProfile.status === 'planned'
                    ? 'var(--bg-widget)'
                    : activeProfile === selectedProfileName
                      ? 'var(--green)'
                      : selectedProfile.accent,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: selectedProfile.status === 'planned' || isSwitching || activeProfile === selectedProfileName ? 'default' : 'pointer',
                  opacity: selectedProfile.status === 'planned' || activeProfile === selectedProfileName ? 0.6 : isSwitching ? 0.8 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                {isSwitching && <span className="codicon codicon-loading" style={{ animation: 'spin 1s linear infinite' }} />}
                {selectedProfile.status === 'planned'
                  ? 'COMING SOON'
                  : activeProfile === selectedProfileName
                    ? '🟢 CURRENTLY ACTIVE'
                    : activeProfile
                      ? 'SWITCH TO THIS'
                      : 'INITIALIZE'}
              </button>
            </div>

            {/* Section 2: System Metrics (Live) - Moved Up */}
            {activeProfile === selectedProfileName && m && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">System Metrics (Live)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                    <DashboardMetricBar label="CPU" valueText={`${m.cpuUsagePercent.toFixed(0)}%`} percent={m.cpuUsagePercent} />
                    <DashboardMetricBar label="RAM" valueText={`${((m.totalMemMb - m.freeMemMb) / 1024).toFixed(1)} / ${(m.totalMemMb / 1024).toFixed(1)} GB`} percent={ramUsedPct} />
                    <DashboardMetricBar label="Disk" valueText={`${m.diskFreeGb.toFixed(0)} GB free`} percent={diskUsedPct} />
                  </div>
                </div>
              </div>
            )}

            
            {/* Workspace & Project Management */}
            {activeProfile === selectedProfileName && (
               <div style={{ marginTop: 32 }}>
                 <div className="dashboard-widget">
                   <h3 className="dashboard-widget-title">Workspace Configuration</h3>
                   <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                     <div>
                        <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Project Path / Mounted Volume</label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <input 
                             type="text" 
                             readOnly 
                             value={projectPath || 'No project linked.'} 
                             style={{ flex: 1, padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 13 }} 
                          />
                          {!projectPath ? (
                            <>
                              <button onClick={handleLinkProject} style={{ padding: '0 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Link Existing</button>
                              <button onClick={() => {
                                if (selectedProfile.name === 'data-science') {
                                  setCreateProjectDeps({ pandas: 'latest', numpy: 'latest' })
                                } else if (selectedProfile.name === 'web-dev') {
                                  setCreateProjectDeps({ tailwindcss: 'latest', 'react-router-dom': 'latest' })
                                } else {
                                  setCreateProjectDeps({})
                                }
                                setCreateProjectModalOpen(true)
                              }} style={{ padding: '0 16px', borderRadius: 6, border: 'none', background: selectedProfile.accent, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Create New</button>
                            </>
                          ) : (
                            <button onClick={async () => {
                               setProjectPath(null);
                               await window.dh.storeSet({ key: `project_dir_${selectedProfileName}`, data: null } as any);
                               setToast({ type: 'success', message: 'Project unlinked from profile.' });
                            }} style={{ padding: '0 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,0,0,0.1)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,0,0,0.2)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,0,0,0.1)'}>Unlink Project</button>
                          )}
                        </div>
                     </div>
                     {projectPath && (
                       <div>
                         <label style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, display: 'block' }}>Open in Editor</label>
                         <div style={{ display: 'flex', gap: 12 }}>
                           <select 
                             value={selectedEditorCmd}
                             onChange={(e) => setSelectedEditorCmd(e.target.value)}
                             style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 13, minWidth: 200 }}
                           >
                              {installedEditors.length === 0 && <option value="">No editors found</option>}
                              {installedEditors.map(ed => (
                                 <option key={ed.name} value={ed.cmd}>{ed.name}</option>
                              ))}
                           </select>
                           <button onClick={handleOpenEditor} disabled={!selectedEditorCmd} style={{ padding: '0 16px', borderRadius: 6, border: 'none', background: 'var(--green)', color: '#fff', cursor: selectedEditorCmd ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600 }}>Open IDE</button>
                         </div>
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            )}

            {/* Section 3: Analytics Grid (Activity + Container Status Side-by-Side) */}
            {activeProfile === selectedProfileName && selectedProfileName && (
              <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
                <ActivityChart data={generateActivityData(selectedProfileName)} />
                <ResourceDonutChart data={generateResourceAllocation(selectedProfileName)} />
              </div>
            )}

            {/* Section 4: Active Containers + Services Grid */}
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Active Containers Table */}
              {activeProfile && (
                <div>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Active Containers
                  </h3>
                  {activeContainers.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>State</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600 }}>Image</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeContainers.map((row) => (
                            <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 12px' }}>{row.name}</td>
                              <td style={{ padding: '8px 12px', color: row.state === 'running' ? 'var(--green)' : 'var(--text-muted)' }}>{row.state}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: 12 }}>{row.image}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      No containers running for this profile.
                    </div>
                  )}
                </div>
              )}

              {/* Services Grid */}
              {selectedProfileName && (
                <div>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                    Services
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {generateServices(selectedProfileName).map((s) => (
                      <div
                        key={s.id}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          backdropFilter: 'blur(8px)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.status === 'running' ? 'var(--green)' : s.status === 'pending' ? 'var(--yellow)' : 'var(--text-muted)' }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.uptime}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Recent Activity Feed at Bottom */}
            {selectedProfileName && (
              <div style={{ marginTop: 32 }}>
                <EventFeed events={generateEventFeed(selectedProfileName)} />
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Select a profile from the right panel.</div>
        )}
      </div>

      {/* RIGHT: Profile Sidebar */}
      <div className="dashboard-sidebar">
        <h3 style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Profiles
        </h3>
        <div className="profile-list">
          {PRESET_PROFILES.map((prof) => (
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
                border: selectedProfileName === prof.name ? `1px solid ${prof.accent}` : '1px solid var(--border)',
                borderRadius: 6,
                background: selectedProfileName === prof.name ? `color-mix(in srgb, ${prof.accent} 8%, var(--bg-widget))` : 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                marginBottom: 8,
                transition: 'all 0.2s ease',
              }}
            >
              <span className={`codicon codicon-${prof.icon}`} style={{ fontSize: 16, color: prof.accent, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {prof.title}
              </span>
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: activeProfile === prof.name ? prof.accent : 'var(--border)',
                flexShrink: 0,
              }} />
            </button>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && selectedProfile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg-widget)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 400,
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>Switch Profile?</h3>
            <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5 }}>
              {activeProfile ? (
                <>
                  Compose down <strong style={{ color: 'var(--text)' }}>{activeProfile}</strong>, then start{' '}
                  <strong style={{ color: 'var(--text)' }}>{selectedProfile.title}</strong>?
                </>
              ) : (
                <>Start <strong style={{ color: 'var(--text)' }}>{selectedProfile.title}</strong>?</>
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
                Cancel
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
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      {createProjectModalOpen && selectedProfile && (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content" style={{ maxWidth: selectedProfile.name === 'data-science' ? 520 : 400 }}>
            {isScaffolding ? (
               <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>{scaffoldStatusText}</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Setting up {createProjectName}, this might take a minute...</p>
                  
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 24, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)' }}>
                    <div style={{ width: `${scaffoldProgress}%`, height: '100%', background: selectedProfile.accent, borderRadius: 3, transition: 'width 0.4s ease-out', boxShadow: `0 0 10px ${selectedProfile.accent}` }} />
                  </div>
                  
                  {installLogs.length > 0 && (
                    <div style={{ marginTop: 24, textAlign: 'left', background: 'rgba(0,0,0,0.4)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                      {/* Terminal Header */}
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'sans-serif', letterSpacing: 0.5 }}>Installation Progress</span>
                      </div>
                      {/* Terminal Body */}
                      <div ref={logsContainerRef} style={{ padding: 12, height: 140, overflowY: 'auto', fontFamily: '"Fira Code", monospace, Consolas', fontSize: 12, color: '#a9adc1', lineHeight: 1.5 }}>
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
            ) : selectedProfile.name !== 'data-science' && selectedProfile.name !== 'web-dev' ? (
              <>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>Create New Project</h2>
                <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>
                  Enter a name for your new <strong style={{ color: 'var(--text)' }}>{selectedProfile.title}</strong> project.
                  It will be created in your LuminaProjects workspace.
                </p>
                <input
                  type="text"
                  autoFocus
                  value={createProjectName}
                  onChange={(e) => setCreateProjectName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitCreateProject() }}
                  placeholder="e.g. my-awesome-app"
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
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = selectedProfile.accent }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => setCreateProjectModalOpen(false)}
                    style={{
                      padding: '10px 24px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitCreateProject}
                    disabled={!createProjectName.trim()}
                    style={{
                      padding: '10px 24px', border: 'none', borderRadius: 6, background: createProjectName.trim() ? selectedProfile.accent : 'rgba(255,255,255,0.1)', color: createProjectName.trim() ? '#fff' : 'var(--text-muted)', cursor: createProjectName.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 14, boxShadow: createProjectName.trim() ? `0 4px 12px ${selectedProfile.accent}40` : 'none', transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => { if (createProjectName.trim()) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 16px ${selectedProfile.accent}60` } }}
                    onMouseLeave={(e) => { if (createProjectName.trim()) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 12px ${selectedProfile.accent}40` } }}
                  >
                    Create
                  </button>
                </div>
              </>
            ) : selectedProfileName === 'data-science' || selectedProfileName === 'web-dev' ? (
              <>
                 <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>{selectedProfileName === 'data-science' ? 'Data Science' : 'Web Development'} Setup Wizard</h2>
                 
                 <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                    {[1, 2, 3].map(step => (
                      <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, background: step <= createProjectStep ? selectedProfile.accent : 'rgba(255,255,255,0.1)', transition: 'background 0.3s ease' }} />
                    ))}
                 </div>

                 {createProjectStep === 1 && (
                    <div style={{ animation: 'fade-in 0.3s ease' }}>
                      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>Step 1: Project Name & Runtime Environment.</p>
                      
                      <strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>Project Name</strong>
                      <input
                        type="text"
                        autoFocus
                        value={createProjectName}
                        onChange={(e) => setCreateProjectName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && createProjectName.trim()) setCreateProjectStep(2) }}
                        placeholder={selectedProfileName === 'data-science' ? "e.g. sales-analysis" : "e.g. ecommerce-app"}
                        style={{
                          width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 16, marginBottom: 20, outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)', transition: 'border-color 0.2s ease',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = selectedProfile.accent }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                      />

                      {selectedProfileName === 'data-science' ? (
                        <>
                          <strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>Python Version</strong>
                          <select
                            value={createProjectPythonVer}
                            onChange={(e) => setCreateProjectPythonVer(e.target.value)}
                            style={{
                              width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 16, marginBottom: 32, outline: 'none', appearance: 'none', cursor: 'pointer'
                            }}
                          >
                            <option value="latest">Latest Stable (from Jupyter)</option>
                            <option value="3.11">Python 3.11</option>
                            <option value="3.10">Python 3.10</option>
                            <option value="3.9">Python 3.9</option>
                            <option value="3.8">Python 3.8</option>
                          </select>
                        </>
                      ) : (
                        <>
                          <strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>Node.js Version</strong>
                          <select
                            value={createProjectPythonVer} // We are reusing the state variable for simplicity
                            onChange={(e) => setCreateProjectPythonVer(e.target.value)}
                            style={{
                              width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 16, marginBottom: 32, outline: 'none', appearance: 'none', cursor: 'pointer'
                            }}
                          >
                            <option value="latest">Latest Stable (22-alpine)</option>
                            <option value="20">Node.js 20 (LTS)</option>
                            <option value="18">Node.js 18</option>
                          </select>
                        </>
                      )}
                    </div>
                 )}
                 {createProjectStep === 2 && (
                    <div style={{ animation: 'fade-in 0.3s ease' }}>
                      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>Step 2: Database Configuration.</p>
                      
                      <strong style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>PostgreSQL Engine Version</strong>
                      <select
                        value={createProjectPostgresVer}
                        onChange={(e) => setCreateProjectPostgresVer(e.target.value)}
                        style={{
                          width: '100%', padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontSize: 16, marginBottom: 20, outline: 'none', appearance: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="16">PostgreSQL 16 (Recommended)</option>
                        <option value="15">PostgreSQL 15</option>
                        <option value="14">PostgreSQL 14</option>
                        <option value="13">PostgreSQL 13</option>
                      </select>

                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8, border: `1px solid ${selectedProfile.accent}50`, marginBottom: 32 }}>
                        <strong style={{ display: 'block', marginBottom: 8, color: selectedProfile.accent }}>Isolated Environment</strong>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>A dedicated PostgreSQL database will be isolated for this project automatically. A `.env` file will be generated with the connection string `DATABASE_URL`.</p>
                      </div>
                    </div>
                 )}
                 {createProjectStep === 3 && (
                    <div style={{ animation: 'fade-in 0.3s ease' }}>
                      <p style={{ margin: '0 0 24px', color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6 }}>Step 3: Initial Files & Dependencies.</p>
                      
                      <div style={{ marginBottom: 20 }}>
                        <strong style={{ display: 'block', marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Scaffold Files</strong>
                        {selectedProfileName === 'data-science' ? (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked={createProjectNotebook} onChange={e => setCreateProjectNotebook(e.target.checked)} style={{ width: 16, height: 16, accentColor: selectedProfile.accent }} />
                              <span style={{ fontSize: 14 }}>Generate sample <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>exploration.ipynb</code></span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, cursor: 'pointer' }}>
                              <input type="checkbox" checked={createProjectMainPy} onChange={e => setCreateProjectMainPy(e.target.checked)} style={{ width: 16, height: 16, accentColor: selectedProfile.accent }} />
                              <span style={{ fontSize: 14 }}>Generate <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>main.py</code> script</span>
                            </label>
                          </>
                        ) : (
                          <>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, cursor: 'pointer' }}>
                              <input type="checkbox" checked={true} readOnly style={{ width: 16, height: 16, accentColor: selectedProfile.accent }} />
                              <span style={{ fontSize: 14 }}>Vite + React Template (TypeScript)</span>
                            </label>
                          </>
                        )}
                      </div>

                      <div style={{ marginBottom: 20 }}>
                        <strong style={{ display: 'block', marginBottom: 12, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>Core {selectedProfileName === 'data-science' ? 'Python' : 'NPM'} Libraries</strong>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {(selectedProfileName === 'data-science' ? 
                            ['pandas', 'numpy', 'matplotlib', 'scikit-learn', 'tensorflow', 'torch', 'seaborn', 'sqlalchemy'] :
                            ['tailwindcss', 'react-router-dom', 'axios', 'zod', 'framer-motion', 'lucide-react', 'zustand', 'react-query']
                          ).map(dep => (
                            <div key={dep} style={{ display: 'flex', alignItems: 'center', gap: 8, background: Object.keys(createProjectDeps).includes(dep) ? `${selectedProfile.accent}20` : 'rgba(255,255,255,0.02)', padding: '6px 12px', borderRadius: 6, border: `1px solid ${Object.keys(createProjectDeps).includes(dep) ? selectedProfile.accent : 'rgba(255,255,255,0.05)'}`, transition: 'all 0.2s' }}>
                              <input type="checkbox" checked={Object.keys(createProjectDeps).includes(dep)} onChange={e => {
                                if (e.target.checked) setCreateProjectDeps({ ...createProjectDeps, [dep]: 'latest' })
                                else {
                                  const newDeps = { ...createProjectDeps };
                                  delete newDeps[dep];
                                  setCreateProjectDeps(newDeps);
                                }
                              }} style={{ width: 16, height: 16, accentColor: selectedProfile.accent, cursor: 'pointer', flexShrink: 0 }} />
                              <span style={{ fontSize: 14, color: Object.keys(createProjectDeps).includes(dep) ? '#fff' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{dep}</span>
                              {Object.keys(createProjectDeps).includes(dep) && (
                                <input
                                  type="text"
                                  placeholder="latest"
                                  value={createProjectDeps[dep] === 'latest' ? '' : createProjectDeps[dep]}
                                  onChange={(e) => setCreateProjectDeps({ ...createProjectDeps, [dep]: e.target.value })}
                                  style={{ width: 55, padding: '2px 6px', fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 4, outline: 'none' }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginBottom: 8, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                          <input type="checkbox" checked={createProjectAutoInstall} onChange={e => setCreateProjectAutoInstall(e.target.checked)} style={{ width: 16, height: 16, accentColor: selectedProfile.accent }} />
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>Auto-install dependencies now</span>
                        </label>
                        <p style={{ margin: '6px 0 0 28px', fontSize: 12, color: 'var(--text-muted)' }}>If unchecked, <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: 3 }}>{selectedProfileName === 'data-science' ? 'requirements.txt' : 'package.json'}</code> will be created but you must run install manually.</p>
                      </div>
                    </div>
                 )}

                 <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, marginTop: 16 }}>
                   <button
                     type="button"
                     onClick={() => { setCreateProjectModalOpen(false); setCreateProjectStep(1) }}
                     style={{ padding: '10px 20px', border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                     onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
                     onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                   >
                     Cancel
                   </button>
                   
                   {createProjectStep > 1 && (
                     <button
                       type="button"
                       onClick={() => setCreateProjectStep(s => s - 1)}
                       style={{ padding: '10px 24px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'rgba(255,255,255,0.05)', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s ease' }}
                       onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                       onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                     >
                       Back
                     </button>
                   )}
                   
                   {createProjectStep < 3 ? (
                     <button
                       type="button"
                       onClick={() => setCreateProjectStep(s => s + 1)}
                       disabled={createProjectStep === 1 && !createProjectName.trim()}
                       style={{ padding: '10px 24px', border: 'none', borderRadius: 6, background: (createProjectStep === 1 && !createProjectName.trim()) ? 'rgba(255,255,255,0.1)' : selectedProfile.accent, color: (createProjectStep === 1 && !createProjectName.trim()) ? 'var(--text-muted)' : '#fff', cursor: (createProjectStep === 1 && !createProjectName.trim()) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s ease' }}
                     >
                       Next
                     </button>
                   ) : (
                     <button
                       type="button"
                       onClick={submitCreateProject}
                       style={{ padding: '10px 24px', border: 'none', borderRadius: 6, background: selectedProfile.accent, color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: `0 4px 12px ${selectedProfile.accent}40`, transition: 'all 0.2s ease' }}
                       onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 16px ${selectedProfile.accent}60` }}
                       onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 12px ${selectedProfile.accent}40` }}
                     >
                       Scaffold Project
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

function ActivityChart(props: { data: Array<{ label: string; cpu: number; ram: number }> }): ReactElement {
  const maxVal = 100
  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Activity (Last 24h)</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, justifyContent: 'space-around', height: 200, padding: '16px 0' }}>
        {props.data.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ display: 'flex', gap: 4, height: 140, alignItems: 'flex-end' }}>
              <div style={{ width: 12, height: `${(d.cpu / maxVal) * 120}px`, background: 'var(--accent)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} title={`CPU ${d.cpu.toFixed(0)}%`} />
              <div style={{ width: 12, height: `${(d.ram / maxVal) * 120}px`, background: 'var(--green)', borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease' }} title={`RAM ${d.ram.toFixed(0)}%`} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>{d.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CPU</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--green)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>RAM</span>
        </div>
      </div>
    </div>
  )
}

function ResourceDonutChart(props: { data: Array<{ label: string; value: number; color: string }> }): ReactElement {
  const total = props.data.reduce((sum, d) => sum + d.value, 0)
  const normalized = props.data.map(d => ({ ...d, percent: (d.value / total) * 100 }))

  let conic = 'conic-gradient('
  let angle = 0
  normalized.forEach((d, i) => {
    const sliceAngle = (d.percent / 100) * 360
    conic += `${d.color} ${angle}deg, ${d.color} ${angle + sliceAngle}deg${i < normalized.length - 1 ? ', ' : ''}`
    angle += sliceAngle
  })
  conic += ')'

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Container Status</h3>
      <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        <div style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: conic,
          boxShadow: 'inset 0 0 0 50px var(--bg-widget)',
        }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {normalized.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 12, height: 12, background: d.color, borderRadius: '50%' }} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{d.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{d.percent.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventFeed(props: { events: Array<{ id: string; icon: string; color: string; title: string; time: string }> }): ReactElement {
  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Recent Activity</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {props.events.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className={`codicon codicon-${e.icon}`} style={{ fontSize: 14, color: '#fff' }} />
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
  const tone = props.barColor ?? (pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--yellow)' : 'var(--green)')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{props.label}</span>
        <strong style={{ fontSize: 13, color: tone }}>{props.valueText}</strong>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'color-mix(in srgb, var(--border) 80%, transparent)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: tone, transition: 'width 0.35s ease-out' }} />
      </div>
      {props.subline && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{props.subline}</span>}
    </div>
  )
}
