import {
  type ComposeProfile,
  type ContainerRow,
  type HostMetricsResponse,
  parseStoredActiveProfile,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  }, [])

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

  function handleConfirmSwitch(): void {
    if (!selectedProfileName) return
    setConfirmModalOpen(false)
    setIsSwitching(true)
    setToast({ type: 'success', message: `Switching to ${selectedProfileName}…` })
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
          <span className={`codicon ${toast.type === 'success' ? 'codicon-check' : 'codicon-error'}`} style={{ fontSize: 16 }} />
          {toast.message}
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
                disabled={selectedProfile.status === 'planned' || isSwitching}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: selectedProfile.status === 'planned' ? 'var(--bg-widget)' : selectedProfile.accent,
                  color: selectedProfile.status === 'planned' ? 'var(--text-muted)' : '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: selectedProfile.status === 'planned' || isSwitching ? 'default' : 'pointer',
                  opacity: selectedProfile.status === 'planned' || isSwitching ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                {isSwitching && <span className="codicon codicon-loading" style={{ animation: 'spin 1s linear infinite' }} />}
                {selectedProfile.status === 'planned' ? 'COMING SOON' : activeProfile === selectedProfileName ? 'SWITCH TO THIS' : 'INITIALIZE'}
              </button>
            </div>

            {/* Active Containers Section */}
            {activeProfile && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
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
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No containers running for this profile.
                  </div>
                )}
              </div>
            )}

            {/* Analytics Section (if active) */}
            {activeProfile === selectedProfileName && selectedProfileName && (
              <div style={{ marginTop: 32 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
                  <ActivityChart data={generateActivityData(selectedProfileName)} />
                  <ResourceDonutChart data={generateResourceAllocation(selectedProfileName)} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <EventFeed events={generateEventFeed(selectedProfileName)} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <ServicesGrid services={generateServices(selectedProfileName)} />
                  </div>
                  {m && (
                    <div style={{ gridColumn: '1 / -1' }}>
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
                </div>
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

function ServicesGrid(props: { services: Array<{ id: string; name: string; status: 'running' | 'pending' | 'idle'; uptime: string }> }): ReactElement {
  const statusColor = (status: string) => {
    if (status === 'running') return 'var(--green)'
    if (status === 'pending') return 'var(--yellow)'
    return 'var(--text-muted)'
  }

  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">Services</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {props.services.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 16,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(s.status) }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{s.name}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              <div>Status: {s.status}</div>
              <div>Uptime: {s.uptime}</div>
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
