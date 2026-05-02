import type { ReactElement } from 'react'
import { useEffect, useState, useMemo } from 'react'
import { GLASS } from '../layout/GLASS'

type ReadinessReport = {
  hardware: {
    cpu_model: string
    cpu_cores: number
    ram_total_gb: number
    ram_free_gb: number
    disk_total_gb: number
    disk_free_gb: number
  }
  software: {
    docker_installed: boolean
    docker_running: boolean
    docker_version: string
    in_docker_group: boolean
    kvm_supported: boolean
    is_sandboxed: boolean
  }
  network: {
    github_latency_ms: number | null
    gitlab_latency_ms: number | null
    docker_hub_latency_ms: number | null
  }
  tools: {
    curl: boolean
    tar: boolean
    unzip: boolean
    git: boolean
  }
}

type Category = 'hardware' | 'docker' | 'virtualization' | 'network' | 'tools'

export function SystemReadinessPage(): ReactElement {
  const [report, setReport] = useState<ReadinessReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category>('hardware')
  const [fixing, setFixing] = useState<string | null>(null)

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res = await (window.dh.ipcInvoke('dh:system:readiness:check', {}) as Promise<{ ok: boolean; report: ReadinessReport }>)
      if (res.ok) setReport(res.report)
    } catch (e) {
      console.error('Readiness check failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchReport()
  }, [])

  const categories = useMemo(() => [
    { id: 'hardware' as Category, label: 'Hardware', icon: 'server' },
    { id: 'docker' as Category, label: 'Docker', icon: 'package' },
    { id: 'virtualization' as Category, label: 'Virtualization', icon: 'circuit-board' },
    { id: 'network' as Category, label: 'Network', icon: 'globe' },
    { id: 'tools' as Category, label: 'System Tools', icon: 'tools' },
  ], [])

  const renderHardware = () => {
    if (!report) return null
    const { hardware } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>Hardware Health</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <StatCard label="CPU Model" value={hardware.cpu_model} subValue={`${hardware.cpu_cores} Cores`} />
          <StatCard 
            label="RAM" 
            value={`${hardware.ram_total_gb.toFixed(1)} GB`} 
            subValue={`${hardware.ram_free_gb.toFixed(1)} GB Available`}
            status={hardware.ram_total_gb < 4 ? 'warning' : 'ok'}
          />
          <StatCard 
            label="Storage" 
            value={`${hardware.disk_total_gb.toFixed(1)} GB`} 
            subValue={`${hardware.disk_free_gb.toFixed(1)} GB Free`}
            status={hardware.disk_free_gb < 10 ? 'warning' : 'ok'}
          />
        </div>
      </div>
    )
  }

  const renderDocker = () => {
    if (!report) return null
    const { software } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>Docker Engine</h2>
        <CheckRow 
          label="Docker Installed" 
          status={software.docker_installed} 
          desc={software.docker_installed ? `Version ${software.docker_version}` : 'Docker binary not found in PATH.'}
        />
        <CheckRow 
          label="Daemon Running" 
          status={software.docker_running} 
          desc={software.docker_running ? 'Service is active.' : 'Docker daemon is not responding.'}
          onFix={!software.docker_running ? async () => {
            setFixing('docker-start')
            try {
              const res = await (window.dh.ipcInvoke('dh:system:readiness:fix', { id: 'docker-start' }) as Promise<{ ok: boolean; error?: string }>)
              if (res.ok) await fetchReport()
              else alert(res.error)
            } finally {
              setFixing(null)
            }
          } : undefined}
        />
        <CheckRow 
          label="Permissions" 
          status={software.in_docker_group} 
          desc={software.in_docker_group ? 'User is in docker group.' : 'Missing permissions to access docker socket.'}
          onFix={!software.in_docker_group ? async () => {
            setFixing('docker-group')
            try {
              const res = await (window.dh.ipcInvoke('dh:system:readiness:fix', { id: 'docker-group' }) as Promise<{ ok: boolean; error?: string }>)
              if (res.ok) alert('Added to group. You may need to log out and back in for changes to take effect.')
              else alert(res.error)
              await fetchReport()
            } finally {
              setFixing(null)
            }
          } : undefined}
        />
      </div>
    )
  }

  const renderVirtualization = () => {
    if (!report) return null
    const { software } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>Virtualization (KVM)</h2>
        <CheckRow 
          label="KVM Support" 
          status={software.kvm_supported} 
          desc={software.kvm_supported ? 'KVM is available and accessible.' : 'KVM not detected or permissions denied.'}
        />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          KVM is required for high-performance development kernels. Ensure VT-x/AMD-V is enabled in BIOS.
        </p>
      </div>
    )
  }

  const renderNetwork = () => {
    if (!report) return null
    const { network } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>Connectivity</h2>
        <LatencyRow label="GitHub" latency={network.github_latency_ms} />
        <LatencyRow label="GitLab" latency={network.gitlab_latency_ms} />
        <LatencyRow label="Docker Hub" latency={network.docker_hub_latency_ms} />
      </div>
    )
  }

  const renderTools = () => {
    if (!report) return null
    const { tools } = report
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ margin: 0 }}>System Tools</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          <ToolBadge label="Git" status={tools.git} />
          <ToolBadge label="Curl" status={tools.curl} />
          <ToolBadge label="Tar" status={tools.tar} />
          <ToolBadge label="Unzip" status={tools.unzip} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 32, height: '100%' }}>
      <aside style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', padding: '0 12px 12px' }}>
          READINESS WIZARD
        </div>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px',
              borderRadius: 12,
              border: 'none',
              background: activeCategory === cat.id ? 'rgba(124,77,255,0.1)' : 'transparent',
              color: activeCategory === cat.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              textAlign: 'left',
              fontWeight: activeCategory === cat.id ? 600 : 500,
              transition: 'all 0.2s ease',
            }}
          >
            <span className={`codicon codicon-${cat.icon}`} />
            {cat.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: 12 }}>
          <button 
            className="hp-btn hp-btn-primary" 
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={fetchReport}
            disabled={loading}
          >
            {loading ? 'Auditing...' : 'Run Audit'}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, ...GLASS, borderRadius: 24, padding: 32, overflow: 'auto' }}>
        {loading && !report ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
            <div className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 32 }} />
            <div className="mono" style={{ color: 'var(--text-muted)' }}>Probing system architecture...</div>
          </div>
        ) : (
          <>
            {activeCategory === 'hardware' && renderHardware()}
            {activeCategory === 'docker' && renderDocker()}
            {activeCategory === 'virtualization' && renderVirtualization()}
            {activeCategory === 'network' && renderNetwork()}
            {activeCategory === 'tools' && renderTools()}
          </>
        )}
      </main>
    </div>
  )
}

function StatCard({ label, value, subValue, status = 'ok' }: { label: string; value: string; subValue: string; status?: 'ok' | 'warning' | 'error' }) {
  const color = status === 'ok' ? 'var(--green)' : status === 'warning' ? 'var(--orange)' : 'var(--red)'
  return (
    <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subValue}</div>
    </div>
  )
}

function CheckRow({ label, status, desc, onFix }: { label: string; status: boolean; desc: string; onFix?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, border: '1px solid var(--border)' }}>
      <div style={{ 
        width: 32, height: 32, borderRadius: 16, 
        background: status ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: status ? 'var(--green)' : 'var(--red)'
      }}>
        <span className={`codicon codicon-${status ? 'check' : 'close'}`} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{desc}</div>
      </div>
      {onFix && (
        <button className="hp-btn hp-btn-primary" onClick={onFix} style={{ fontSize: 12, padding: '4px 12px' }}>
          Fix It
        </button>
      )}
    </div>
  )
}

function LatencyRow({ label, latency }: { label: string; latency: number | null }) {
  const status = latency === null ? 'error' : latency > 500 ? 'warning' : 'ok'
  const color = status === 'ok' ? 'var(--green)' : status === 'warning' ? 'var(--orange)' : 'var(--red)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}>
      <div className="mono" style={{ width: 100 }}>{label}</div>
      <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, position: 'relative' }}>
        {latency !== null && (
          <div style={{ 
            position: 'absolute', left: 0, top: 0, bottom: 0, 
            width: `${Math.min(latency / 10, 100)}%`, 
            background: color, borderRadius: 2 
          }} />
        )}
      </div>
      <div className="mono" style={{ width: 80, textAlign: 'right', color }}>
        {latency === null ? 'Timeout' : `${latency}ms`}
      </div>
    </div>
  )
}

function ToolBadge({ label, status }: { label: string; status: boolean }) {
  return (
    <div style={{ 
      padding: '10px 14px', borderRadius: 12, 
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: status ? 1 : 0.5,
      background: status ? 'rgba(0,230,118,0.05)' : 'transparent'
    }}>
      <span className={`codicon codicon-${status ? 'pass' : 'error'}`} style={{ color: status ? 'var(--green)' : 'var(--red)' }} />
      <span className="mono" style={{ fontSize: 13 }}>{label}</span>
    </div>
  )
}
