import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { HostSecuritySnapshot } from '@linux-dev-home/shared'

const UNITS = ['docker', 'ssh', 'nginx'] as const

export function DashboardKernelsPage(): ReactElement {
  const [gpu, setGpu] = useState('Detecting GPU…')
  const [units, setUnits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      const g = await window.dh.hostExec({ command: 'nvidia_smi_short' })
      setGpu(g.ok && typeof g.result === 'string' ? g.result : 'GPU: unavailable')
    } catch {
      setGpu('GPU: unavailable')
    }

    const nextUnits: Record<string, string> = {}
    for (const unit of UNITS) {
      try {
        const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit })
        nextUnits[unit] = s.ok ? String(s.result ?? 'unknown') : 'unknown'
      } catch {
        nextUnits[unit] = 'unknown'
      }
    }
    setUnits(nextUnits)
    setBusy(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980, margin: '0 auto', paddingInline: 12 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          DASHBOARD.KERNELS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Kernels &amp; toolchains</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>
          Quick host checks for kernel-adjacent tooling. This page is now functional: GPU probe + service status
          snapshots.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', rowGap: 8 }}>
        <button type="button" onClick={() => void refresh()} className="hp-btn" disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh checks'}
        </button>
        <button type="button" className="hp-btn" onClick={() => void window.dh.openExternal('https://kernel.org/')}>
          Kernel docs
        </button>
      </div>

      <section style={card}>
        <div className="hp-card-header">
          <div className="hp-card-title">GPU snapshot</div>
          <div className="hp-card-subtitle">Runtime detection from host tooling.</div>
        </div>
        <pre className="mono" style={{ ...pre, overflowX: 'auto' }}>{gpu}</pre>
      </section>

      <section style={card}>
        <div className="hp-card-header">
          <div className="hp-card-title">Service states</div>
          <div className="hp-card-subtitle">Quick status for critical local services.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {UNITS.map((u) => (
            <div key={u} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#141414' }}>
              <div className="mono" style={{ fontSize: 12 }}>{u}</div>
              <div style={{ marginTop: 6, color: colorFor(units[u]), fontWeight: 600 }}>{units[u] ?? '…'}</div>
            </div>
          ))}
        </div>
      </section>

      <SecuritySection />
    </div>
  )
}

function SecuritySection(): ReactElement {
  const [data, setData] = useState<HostSecuritySnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetch() {
    setLoading(true)
    try {
      const res = await window.dh.monitorSecurity()
      if (res.ok) setData(res.snapshot)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetch()
  }, [])

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Scanning security…</div>
  if (!data) return <div style={{ color: 'var(--orange)', fontSize: 14 }}>Security probe failed.</div>

  return (
    <section style={card}>
      <div className="hp-card-header">
        <div className="hp-card-title">Security hardening</div>
        <div className="hp-card-subtitle">Host-level configuration audit.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
        <SecurityItem label="Firewall" value={data.firewall} ok={data.firewall === 'active'} />
        <SecurityItem label="SELinux" value={data.selinux} ok={data.selinux === 'enabled'} />
        <SecurityItem label="SSH Root Login" value={data.sshPermitRootLogin} ok={data.sshPermitRootLogin === 'no'} />
        <SecurityItem label="SSH Password Auth" value={data.sshPasswordAuth} ok={data.sshPasswordAuth === 'no'} />
      </div>
      {data.riskyOpenPorts.length > 0 && (
        <div style={{ marginTop: 16, padding: 10, background: 'rgba(255, 68, 68, 0.1)', borderRadius: 8, border: '1px solid rgba(255, 68, 68, 0.2)' }}>
          <div style={{ fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>⚠️ Risky open ports detected</div>
          <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>{data.riskyOpenPorts.join(', ')}</div>
        </div>
      )}
    </section>
  )
}

function SecurityItem({ label, value, ok }: { label: string; value: string; ok: boolean }): ReactElement {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#141414' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, color: ok ? 'var(--green)' : 'var(--orange)', fontWeight: 600, fontSize: 14 }}>
        {value.toUpperCase()}
      </div>
    </div>
  )
}

function colorFor(s?: string): string {
  if (s === 'active') return 'var(--green)'
  if (s === 'failed') return 'var(--red)'
  if (s === 'inactive') return 'var(--yellow)'
  return 'var(--text-muted)'
}

const card = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 16,
}

const pre = {
  margin: '10px 0 0 0',
  padding: 10,
  background: '#0a0a0a',
  border: '1px solid var(--border)',
  borderRadius: 8,
  whiteSpace: 'pre-wrap' as const,
  fontSize: 12,
}
