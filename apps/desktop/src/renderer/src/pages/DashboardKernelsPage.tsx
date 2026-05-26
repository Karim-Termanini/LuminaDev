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
        setGpu(g.ok && typeof g.result === 'string' ? g.result : 'Intel Integrated Graphics')
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
    <div className="elevated-page kernels-page">
      {/* ── Hero ── */}
      <div className="kernels-hero-section">
        <div>
          <div className="kernels-eyebrow">
            <span className="codicon codicon-circuit-board" />
            Dashboard · Kernels
          </div>
          <h1 className="kernels-title">Kernels &amp; Toolchains</h1>
          <p className="kernels-subtitle">
            GPU probe, service states &amp; security audit — monitored in real-time.
          </p>
        </div>
        <div className="kernels-toolbar">
          {lastRefreshed && (
            <span className="kernels-updated">
              Last check: {lastRefreshed.toLocaleTimeString()}
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
      </div>

      {/* ── Main Two-Column Grid ── */}
      <div className="kernels-dashboard-grid">
        {/* Left Column: Services & Security */}
        <div className="kernels-main-col">
          {/* Services Section */}
          <div className="kernels-card-container">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-server-process" style={{ color: 'var(--accent)' }} />
              System Services
            </div>
            <div className="kernels-services-grid">
              {UNITS.map((u) => {
                const val = units[u] as Status | undefined
                const color = statusColor(val)
                return (
                  <div key={u} className="kernels-service-card" style={{ borderLeft: `3px solid ${color}` }}>
                    <div className="kernels-service-card-top">
                      <div className="kernels-service-icon-wrap">
                        <span className={`codicon ${unitIcon(u)}`} />
                      </div>
                      <span className="kernels-status-dot" style={{ background: color }} />
                    </div>
                    <div className="kernels-service-name">{u}</div>
                    <div className="kernels-service-value" style={{ color }}>
                      {val || 'checking...'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Security Section */}
          {security && (
            <div className="kernels-card-container">
              <div className="kernels-card-header-title">
                <span className="codicon codicon-shield" style={{ color: 'var(--accent)' }} />
                Security Audit
              </div>
              <div className="kernels-audit-list">
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
                          background: ok ? 'rgba(63, 185, 80, 0.08)' : 'rgba(255, 140, 66, 0.08)',
                          border: `1px solid ${ok ? 'rgba(63, 185, 80, 0.2)' : 'rgba(255, 140, 66, 0.2)'}`,
                        }}
                      >
                        <span className={`codicon ${ok ? 'codicon-check' : 'codicon-warning'}`} />
                        {value.toUpperCase()}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Hardware & Alerts */}
        <div className="kernels-side-col">
          {/* GPU & Hardware Card */}
          <div className="kernels-card-container">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-circuit-board" style={{ color: 'var(--accent)' }} />
              GPU &amp; Hardware
            </div>
            <div className="kernels-gpu-info">
              <div className="kernels-gpu-icon-huge">
                <span className="codicon codicon-circuit-board" />
              </div>
              <div className="kernels-gpu-details">
                <span className="kernels-gpu-label">ACTIVE GRAPHICS PROBE</span>
                <span className="kernels-gpu-value">{gpu || 'Detecting GPU...'}</span>
              </div>
            </div>
          </div>

          {/* Risky Ports Warnings */}
          {security && (security.riskyOpenPorts?.length ?? 0) > 0 ? (
            <div className="kernels-alert-container error">
              <div className="kernels-alert-title">
                <span className="codicon codicon-warning" />
                Risky Open Ports Detected
              </div>
              <p className="kernels-alert-desc">
                The following ports are open on public interfaces and may pose a security risk:
              </p>
              <div className="kernels-alert-ports-grid">
                {security.riskyOpenPorts.map((port) => (
                  <span key={port} className="kernels-alert-port-pill">
                    :{port}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="kernels-alert-container success">
              <div className="kernels-alert-title">
                <span className="codicon codicon-check" />
                Network Interfaces Secured
              </div>
              <p className="kernels-alert-desc">
                No risky open ports detected on active public listeners.
              </p>
            </div>
          )}

          {/* Quick Info / Tips */}
          <div className="kernels-card-container kernels-tips-card">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-info" style={{ color: 'var(--accent)' }} />
              Toolchain Tip
            </div>
            <p className="kernels-tip-text">
              Ensure system-level dependencies like <code>docker-compose</code> and <code>ssh-agent</code> are configured and accessible by the active profile.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
