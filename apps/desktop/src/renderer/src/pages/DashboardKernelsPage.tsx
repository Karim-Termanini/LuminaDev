import './DashboardKernelsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { HostSecuritySnapshot } from '@linux-dev-home/shared'

const UNITS = ['docker', 'ssh', 'nginx'] as const
const REFRESH_MS = 30_000

type Status = 'active' | 'inactive' | 'failed' | 'unknown'

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

function secOk(label: string, value: string): boolean {
  if (label === 'Firewall') return value === 'active'
  if (label === 'SELinux') return value === 'enabled' || value === 'enforcing'
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

  const secItems = security
    ? [
        { label: 'Firewall', value: security.firewall, icon: 'codicon-shield' },
        { label: 'SELinux', value: security.selinux, icon: 'codicon-lock' },
        { label: 'SSH Root Login', value: security.sshPermitRootLogin, icon: 'codicon-terminal' },
        { label: 'SSH Password Auth', value: security.sshPasswordAuth, icon: 'codicon-key' },
        { label: 'Failed Auth (24h)', value: String(security.failedAuth24h), icon: 'codicon-warning' },
      ]
    : []

  return (
    <div className="kernels-page">

      {/* ── Hero ── */}
      <div className="kernels-hero">
        <div className="kernels-eyebrow">
          <span className="codicon codicon-circuit-board" />
          Dashboard · Kernels
        </div>
        <h1 className="kernels-title">Kernels &amp; Toolchains</h1>
        <p className="kernels-subtitle">
          GPU probe, service states &amp; security audit — refreshes every 30s.
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div className="kernels-toolbar">
        {lastRefreshed && (
          <span className="kernels-updated">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
        )}
        <button
          type="button"
          className="kernels-btn"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <span className={`codicon ${busy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
          {busy ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>

      {/* ── Services ── */}
      <div>
        <div className="kernels-section-label">System Services</div>
        <div className="kernels-services-grid">
          {/* GPU */}
          <div className="kernels-service-card">
            <div className="kernels-service-header">
              <div className="kernels-service-icon-wrap">
                <span className="codicon codicon-circuit-board" />
              </div>
              <div
                className="kernels-status-dot"
                style={{ background: gpu && !gpu.toLowerCase().includes('unavail') ? 'var(--green)' : 'var(--text-muted)' }}
              />
            </div>
            <div className="kernels-service-name">GPU</div>
            <div className="kernels-service-value">{gpu ?? '…'}</div>
          </div>

          {UNITS.map((u) => {
            const val = units[u] as Status | undefined
            const color = statusColor(val)
            return (
              <div
                key={u}
                className="kernels-service-card"
                style={{ borderLeftColor: color }}
              >
                <div className="kernels-service-header">
                  <div className="kernels-service-icon-wrap">
                    <span className={`codicon ${unitIcon(u)}`} />
                  </div>
                  <div className="kernels-status-dot" style={{ background: color }} />
                </div>
                <div className="kernels-service-name">{u}</div>
                <div className="kernels-service-value" style={{ color }}>
                  {val ?? '…'}
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
          <div className="kernels-audit-card">
            {secItems.map(({ label, value, icon }, i) => {
              const ok = secOk(label, value)
              return (
                <div
                  key={label}
                  className="kernels-audit-row"
                  style={{ borderBottom: i < secItems.length - 1 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="kernels-audit-label">
                    <span className={`codicon ${icon}`} style={{ fontSize: 14, color: 'var(--text-muted)' }} />
                    <span>{label}</span>
                  </div>
                  <div
                    className="kernels-audit-badge"
                    style={{
                      color: ok ? 'var(--green)' : 'var(--orange)',
                      background: ok
                        ? 'rgba(0, 230, 118, 0.1)'
                        : 'rgba(255, 140, 66, 0.1)',
                      border: `1px solid ${ok ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 140, 66, 0.3)'}`,
                    }}
                  >
                    <span className={`codicon ${ok ? 'codicon-check' : 'codicon-warning'}`} />
                    {value.toUpperCase()}
                  </div>
                </div>
              )
            })}
          </div>

          {(security.riskyOpenPorts?.length ?? 0) > 0 && (
            <div className="kernels-risky-alert">
              <span className="codicon codicon-warning" style={{ fontSize: 18, color: 'var(--red)' }} />
              <div>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>Risky open ports: </span>
                <span className="mono" style={{ fontSize: 12 }}>{security.riskyOpenPorts.join(', ')}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
