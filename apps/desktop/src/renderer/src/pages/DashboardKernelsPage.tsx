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

function statusVariant(s?: string): 'ok' | 'error' | 'warning' | '' {
  if (s === 'active') return 'ok'
  if (s === 'failed') return 'error'
  if (s === 'inactive') return 'warning'
  return ''
}

function unitIcon(u: string): string {
  if (u === 'docker') return 'codicon-package'
  if (u === 'ssh') return 'codicon-key'
  if (u === 'nginx') return 'codicon-server'
  return 'codicon-circle'
}

function secOk(label: string, value: string): boolean {
  if (label === 'Firewall') return value === 'active'
  if (label === 'SELinux / AppArmor') return value === 'enabled' || value === 'enforcing'
  if (label === 'SSH Root Login') return value === 'no'
  if (label === 'SSH Password Auth') return value === 'no'
  if (label === 'Failed Auth') return value === '0'
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
        { label: 'SELinux / AppArmor', value: security.selinux, icon: 'codicon-lock' },
        { label: 'SSH Root Login', value: security.sshPermitRootLogin, icon: 'codicon-key' },
        { label: 'SSH Password Auth', value: security.sshPasswordAuth, icon: 'codicon-key' },
        { label: 'Failed Auth', value: String(security.failedAuth24h), icon: 'codicon-warning' },
      ]
    : []

  return (
    <div className="elevated-page kernels-page">

      {/* ── Hero ── */}
      <div className="elevated-hero">
        <div className="elevated-hero-eyebrow">
          <span className="codicon codicon-circuit-board" />
          Dashboard · Kernels
        </div>
        <h1 className="elevated-hero-title">Kernels &amp; Toolchains</h1>
        <p className="elevated-hero-subtitle">
          GPU probe, service states &amp; security audit — live refresh every 30s.
        </p>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        {lastRefreshed && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>
        )}
        <button type="button" className="hp-btn" onClick={() => void refresh()} disabled={busy}>
          <span className={`codicon ${busy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Services Grid ── */}
      <div>
        <div className="elevated-section-title" style={{ marginTop: 0 }}>System Services</div>
        <div className="kernels-services-grid">

          {/* GPU tile */}
          <div className={`elevated-tile ${gpu && !gpu.toLowerCase().includes('unavail') ? 'ok' : ''}`}>
            <div className="elevated-tile-icon">
              <span className="codicon codicon-circuit-board" />
            </div>
            <div className="elevated-tile-content">
              <div className="elevated-tile-title">GPU</div>
              <div className="elevated-tile-detail">{gpu ?? '…'}</div>
            </div>
          </div>

          {/* systemd units */}
          {UNITS.map((u) => {
            const v = statusVariant(units[u])
            return (
              <div key={u} className={`elevated-tile ${v}`}>
                <div className="elevated-tile-icon">
                  <span className={`codicon ${unitIcon(u)}`} />
                </div>
                <div className="elevated-tile-content">
                  <div className="elevated-tile-title" style={{ textTransform: 'capitalize' }}>{u}</div>
                  <div className="elevated-tile-detail" style={{ color: statusColor(units[u]), fontWeight: 700 }}>
                    {units[u] ?? '…'}
                  </div>
                </div>
                <div
                  className="kernels-status-dot"
                  style={{ background: statusColor(units[u]) }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Security Audit ── */}
      {security && (
        <div>
          <div className="elevated-section-title">Security Audit</div>
          <div className="elevated-card" style={{ padding: 0, overflow: 'hidden' }}>
            {secItems.map(({ label, value, icon }, i) => {
              const ok = secOk(label, value)
              return (
                <div
                  key={label}
                  className="kernels-sec-row"
                  style={{
                    borderBottom: i < secItems.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                    <span
                      className={`codicon ${icon}`}
                      style={{ fontSize: 15, color: 'var(--text-muted)' }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                  </div>
                  <div
                    className="kernels-sec-badge"
                    style={{
                      color: ok ? 'var(--green)' : 'var(--orange)',
                      background: ok
                        ? 'color-mix(in srgb, var(--green) 10%, transparent)'
                        : 'color-mix(in srgb, var(--orange) 10%, transparent)',
                      border: `1px solid ${ok
                        ? 'color-mix(in srgb, var(--green) 30%, transparent)'
                        : 'color-mix(in srgb, var(--orange) 30%, transparent)'}`,
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
            <div className="elevated-page hp-status-alert error" style={{ marginTop: 12 }}>
              <span className="codicon codicon-warning" style={{ fontSize: 18 }} />
              <div>
                <strong>Risky open ports detected:</strong>{' '}
                <span className="mono">{security.riskyOpenPorts.join(', ')}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
