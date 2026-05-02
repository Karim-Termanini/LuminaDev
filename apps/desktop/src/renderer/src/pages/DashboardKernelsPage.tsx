import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { HostSecuritySnapshot } from '@linux-dev-home/shared'

const UNITS = ['docker', 'ssh', 'nginx'] as const
const REFRESH_MS = 30_000

export function DashboardKernelsPage(): ReactElement {
  const [gpu, setGpu] = useState<string | null>(null)
  const [units, setUnits] = useState<Record<string, string>>({})
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const [gpuRes, secRes] = await Promise.allSettled([
        window.dh.hostExec({ command: 'nvidia_smi_short' }),
        window.dh.monitorSecurity(),
      ])
      if (gpuRes.status === 'fulfilled') {
        const g = gpuRes.value
        setGpu(g.ok && typeof g.result === 'string' ? g.result : 'GPU: unavailable')
      }
      if (secRes.status === 'fulfilled' && secRes.value.ok) {
        setSecurity(secRes.value.snapshot)
      }

      const nextUnits: Record<string, string> = {}
      await Promise.all(
        UNITS.map(async (unit) => {
          try {
            const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit })
            nextUnits[unit] = s.ok ? String(s.result ?? 'unknown') : 'unknown'
          } catch {
            nextUnits[unit] = 'unknown'
          }
        })
      )
      setUnits(nextUnits)
      setLastRefreshed(new Date())
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980, margin: '0 auto', paddingInline: 12 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>DASHBOARD.KERNELS</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Kernels & Toolchains</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
            GPU probe, service states, and security audit. Refreshes every 30 seconds.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefreshed && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button type="button" onClick={() => void refresh()} className="hp-btn" disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        <div style={tile}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>GPU</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{gpu ?? '…'}</div>
        </div>
        {UNITS.map((u) => (
          <div key={u} style={tile}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{u}</div>
            <div style={{ fontWeight: 700, color: colorFor(units[u]) }}>{units[u] ?? '…'}</div>
          </div>
        ))}
      </div>

      {security && (
        <section style={card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Security Audit</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            <SecurityItem label="Firewall" value={security.firewall} ok={security.firewall === 'active'} />
            <SecurityItem label="SELinux / AppArmor" value={security.selinux} ok={security.selinux === 'enabled' || security.selinux === 'enforcing'} />
            <SecurityItem label="SSH Root Login" value={security.sshPermitRootLogin} ok={security.sshPermitRootLogin === 'no'} />
            <SecurityItem label="SSH Password Auth" value={security.sshPasswordAuth} ok={security.sshPasswordAuth === 'no'} />
            <SecurityItem
              label="Failed Auth (24h)"
              value={String(security.failedAuth24h)}
              ok={security.failedAuth24h === 0}
            />
          </div>
          {(security.riskyOpenPorts?.length ?? 0) > 0 && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              <span style={{ fontSize: 13, color: 'var(--red)', fontWeight: 700 }}>⚠ Risky open ports: </span>
              <span className="mono" style={{ fontSize: 12 }}>{security.riskyOpenPorts.join(', ')}</span>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function SecurityItem({ label, value, ok }: { label: string; value: string; ok: boolean }): ReactElement {
  return (
    <div style={tile}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: ok ? 'var(--green)' : 'var(--orange)' }}>
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

const card = { background: 'var(--bg-widget)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const tile = { ...card, padding: 12 }
