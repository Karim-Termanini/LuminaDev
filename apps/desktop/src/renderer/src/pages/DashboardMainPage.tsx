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

  // Default to active profile or first preset
  useEffect(() => {
    if (!selectedProfileName) {
      setSelectedProfileName(activeProfile || PRESET_PROFILES[0].name)
    }
  }, [activeProfile, selectedProfileName])

  function handleConfirmSwitch(): void {
    if (!selectedProfileName) return
    setConfirmModalOpen(false)
    setIsSwitching(true)
    window.dh.profileSwitch({ from: activeProfile ?? undefined, to: selectedProfileName }).then((r) => {
      if (r.ok) {
        setToast({ type: 'success', message: `Switched to ${selectedProfileName}` })
        void refresh()
        setTimeout(() => setToast(null), 2000)
      } else {
        const errMsg = r.error ?? r.log ?? 'Unknown error'
        setToast({ type: 'error', message: humanizeProfileError(errMsg) })
      }
      setIsSwitching(false)
    }).catch((e) => {
      const errMsg = e instanceof Error ? e.message : String(e)
      setToast({ type: 'error', message: errMsg })
      setIsSwitching(false)
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

            {/* System Metrics Section (if active) */}
            {activeProfile === selectedProfileName && m && (
              <div style={{ marginTop: 32 }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  System Metrics
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                  <DashboardMetricBar label="CPU" valueText={`${m.cpuUsagePercent.toFixed(0)}%`} percent={m.cpuUsagePercent} />
                  <DashboardMetricBar label="RAM" valueText={`${((m.totalMemMb - m.freeMemMb) / 1024).toFixed(1)} / ${(m.totalMemMb / 1024).toFixed(1)} GB`} percent={ramUsedPct} />
                  <DashboardMetricBar label="Disk" valueText={`${m.diskFreeGb.toFixed(0)} GB free`} percent={diskUsedPct} />
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
