import './DashboardKernelsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { HostSecuritySnapshot } from '@linux-dev-home/shared'

const UNITS = ['docker', 'ssh', 'nginx'] as const
const REFRESH_MS = 30_000

function statusColor(s?: string): string {
  if (s === 'active') return 'var(--green)'
  if (s === 'failed') return 'var(--red)'
  if (s === 'inactive') return 'var(--yellow)'
  return 'var(--text-muted)'
}

function unitIcon(u: string): string {
  if (u === 'docker') return 'codicon-package'
  if (u === 'ssh') return 'codicon-key'
  if (u === 'nginx') return 'codicon-server'
  return 'codicon-circle'
}

function securityOk(label: string, value: string): boolean {
  if (label === 'Firewall') return value === 'active'
  if (label === 'SELinux / AppArmor') return value === 'enabled' || value === 'enforcing'
  if (label === 'SSH Root Login') return value === 'no'
  if (label === 'SSH Password Auth') return value === 'no'
  if (label === 'Failed Auth (24h)') return value === '0'
  return false
}

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
        setGpu(g.ok && typeof g.result === 'string' ? g.result : 'Unavailable')
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

  const securityItems = security ? [
    { label: 'Firewall', value: security.firewall },
    { label: 'SELinux / AppArmor', value: security.selinux },
    { label: 'SSH Root Login', value: security.sshPermitRootLogin },
    { label: 'SSH Password Auth', value: security.sshPasswordAuth },
    { label: 'Failed Auth (24h)', value: String(security.failedAuth24h) },
  ] : []

  return (
    <div className="kernels-page elevated-page">

      {/* ── Hero ── */}
      <div className="kernels-hero">
        <div>
          <div className="kernels-hero-eyebrow">Dashboard · Kernels</div>
          <h1 className="kernels-hero-title">Kernels &amp; Toolchains</h1>
          <p className="kernels-hero-subtitle">
            GPU probe, service states &amp; security audit — refreshes every 30s.
          </p>
        </div>
        <div className="kernels-hero-actions">
          {lastRefreshed && (
            <span className="kernels-last-updated">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
          <button type="button" onClick={() => void refresh()} className="hp-btn" disabled={busy}>
            <span className={`codicon ${busy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Services ── */}
      <div>
        <div className="kernels-section-label">System Services</div>
        <div className="kernels-services-grid">
          {/* GPU card */}
          <div
            className="kernels-service-card"
            style={{ '--card-accent': 'linear-gradient(90deg, var(--accent), transparent)' } as React.CSSProperties}
          >
            <div className="kernels-service-card-header">
              <div className="kernels-service-icon">
                <span className="codicon codicon-circuit-board" />
              </div>
              <span className="kernels-status-dot" style={{
                background: gpu && !gpu.includes('unavail') ? 'var(--green)' : 'var(--text-muted)'
              }} />
            </div>
            <div>
              <div className="kernels-service-name">GPU</div>
              <div className="kernels-service-value">{gpu ?? '…'}</div>
            </div>
          </div>

          {/* systemd unit cards */}
          {UNITS.map((u) => {
            const status = units[u]
            const color = statusColor(status)
            return (
              <div
                key={u}
                className="kernels-service-card"
                style={{ '--card-accent': `linear-gradient(90deg, ${color}, transparent)` } as React.CSSProperties}
              >
                <div className="kernels-service-card-header">
                  <div className="kernels-service-icon">
                    <span className={`codicon ${unitIcon(u)}`} />
                  </div>
                  <span className="kernels-status-dot" style={{ background: color }} />
                </div>
                <div>
                  <div className="kernels-service-name">{u}</div>
                  <div className="kernels-service-value" style={{ color }}>
                    {status ?? '…'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Security Audit ── */}
      {security && (
        <div>
          <div className="kernels-section-label">Security Audit</div>
          <div className="kernels-security-grid">
            {securityItems.map(({ label, value }) => {
              const ok = securityOk(label, value)
              return (
                <div key={label} className="kernels-security-item">
                  <div className="kernels-security-label">{label}</div>
                  <div
                    className="kernels-security-value"
                    style={{ color: ok ? 'var(--green)' : 'var(--orange)' }}
                  >
                    {value.toUpperCase()}
                  </div>
                </div>
              )
            })}
          </div>

          {(security.riskyOpenPorts?.length ?? 0) > 0 && (
            <div className="kernels-risky-ports" style={{ marginTop: 14 }}>
              <span className="codicon codicon-warning" style={{ color: 'var(--red)', fontSize: 18 }} />
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>
                  Risky open ports:&nbsp;
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>
                  {security.riskyOpenPorts.join(', ')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
