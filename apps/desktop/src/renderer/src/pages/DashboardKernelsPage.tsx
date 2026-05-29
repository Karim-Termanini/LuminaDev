import './DashboardKernelsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { HostSecuritySnapshot, RuntimeStatus, HostPortRow } from '@linux-dev-home/shared'

const REFRESH_MS = 30_000
const HTTP_PORTS = new Set([80, 443, 3000, 3001, 4200, 5000, 5173, 8000, 8080, 8443, 9000])

type KernelDef = {
  id: string
  label: string
  icon: string
  systemdUnit: string
  altUnits?: string[]
  httpPort?: number
  category: 'system' | 'dev'
}

const KERNEL_DEFS: KernelDef[] = [
  { id: 'docker',  label: 'Docker',   icon: 'codicon-package', systemdUnit: 'docker',   category: 'system' },
  { id: 'ssh',     label: 'SSH',      icon: 'codicon-key',     systemdUnit: 'sshd',     altUnits: ['ssh'], category: 'system' },
  { id: 'nginx',   label: 'Nginx',    icon: 'codicon-server',  systemdUnit: 'nginx',    category: 'system' },
  { id: 'jupyter', label: 'Jupyter',  icon: 'codicon-graph',   systemdUnit: 'jupyter',  altUnits: ['jupyter-notebook', 'jupyter-lab'], httpPort: 8888, category: 'dev' },
  { id: 'phpfpm',  label: 'PHP-FPM',  icon: 'codicon-globe',   systemdUnit: 'php-fpm',  altUnits: ['php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm', 'php-fpm8'], category: 'dev' },
]

function secOk(label: string, value: string): boolean {
  if (label === 'Firewall') return value === 'active'
  if (label === 'SELinux') return value === 'enabled' || value === 'enforcing'
  if (label === 'SSH Root Login') return value === 'no'
  if (label === 'SSH Password Auth') return value === 'no'
  if (label === 'Failed Auth (24h)') return value === '0'
  return false
}

function KernelCard({
  def, status, busy, error, linkedPath, onStart, onStop, onLink,
}: {
  def: KernelDef
  status: string
  busy: boolean
  error: string
  linkedPath?: string
  onStart: () => void
  onStop: () => void
  onLink: () => void
}): ReactElement {
  const isActive = status === 'active'
  const isInstalled = status !== 'unknown'
  return (
    <div className="kernel-card">
      <div className="kernel-card-header">
        <span className={`codicon ${def.icon}`} aria-hidden style={{ fontSize: 18, color: isActive ? 'var(--green)' : 'var(--text-muted)' }} />
        <span className="kernel-card-label">{def.label}</span>
        <span className={`kernel-status-badge kernel-status-${status}`}>{status.toUpperCase()}</span>
      </div>
      <div className="kernel-card-unit">systemd: {def.systemdUnit}</div>
      {linkedPath && (
        <div className="kernel-card-link-badge" title={linkedPath}>
          <span className="codicon codicon-link" style={{ fontSize: 10 }} /> {linkedPath.split('/').slice(-2).join('/')}
        </div>
      )}
      {error && <div className="kernel-card-error">{error}</div>}
      <div className="kernel-card-actions">
        {isInstalled && (
          <>
            <button type="button" className="kernel-btn kernel-btn-start" disabled={busy || isActive} onClick={onStart}>
              {busy ? <span className="codicon codicon-loading codicon-modifier-spin" /> : 'Start'}
            </button>
            <button type="button" className="kernel-btn kernel-btn-stop" disabled={busy || !isActive} onClick={onStop}>
              Stop
            </button>
          </>
        )}
        {def.httpPort && isActive && (
          <button type="button" className="kernel-btn kernel-btn-open" onClick={() => void window.dh.openExternal(`http://localhost:${def.httpPort}`)}>
            Open ↗
          </button>
        )}
        <button type="button" className="kernel-btn kernel-btn-link" onClick={onLink}>
          {linkedPath ? 'Relink' : 'Link Project'}
        </button>
      </div>
    </div>
  )
}

export function DashboardKernelsPage(): ReactElement {
  const [gpu, setGpu] = useState<string | null>(null)
  const [units, setUnits] = useState<Record<string, string>>({})
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([])
  const [ports, setPorts] = useState<HostPortRow[]>([])
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const [runtimesLoaded, setRuntimesLoaded] = useState(false)
  const [kernelLinks, setKernelLinks] = useState<Record<string, string>>({})
  const [unitBusy, setUnitBusy] = useState<Record<string, boolean>>({})
  const [unitError, setUnitError] = useState<Record<string, string>>({})

  const { t } = useTranslation('dashboard')

  useEffect(() => {
    window.dh.storeGet({ key: 'kernel_links' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      if (bag.ok && bag.data && typeof bag.data === 'object') {
        setKernelLinks(bag.data as Record<string, string>)
      }
    }).catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const [gpuRes, secRes, rtRes, portsRes] = await Promise.allSettled([
        window.dh.hostExec({ command: 'nvidia_smi_short' }),
        window.dh.monitorSecurity(),
        window.dh.runtimeStatus(),
        window.dh.getHostPorts(),
      ])
      if (gpuRes.status === 'fulfilled') {
        const g = gpuRes.value
        setGpu(g.ok && typeof g.result === 'string' ? g.result : null)
      }
      if (secRes.status === 'fulfilled' && secRes.value.ok) {
        setSecurity(secRes.value.snapshot)
      }
      if (rtRes.status === 'fulfilled' && rtRes.value && rtRes.value.runtimes) {
        setRuntimes(rtRes.value.runtimes)
      }
      setRuntimesLoaded(true)
      if (portsRes.status === 'fulfilled' && Array.isArray(portsRes.value)) {
        setPorts(portsRes.value)
      }
      const nextUnits: Record<string, string> = {}
      await Promise.all(
        KERNEL_DEFS.map(async (def) => {
          try {
            const allUnits = [def.systemdUnit, ...(def.altUnits ?? [])]
            if (allUnits.length > 1) {
              const s = await window.dh.hostExec({
                command: 'systemctl_is_active_fallback',
                units: allUnits,
              })
              const bag = s as { ok: boolean; result?: string }
              nextUnits[def.id] = bag.ok ? String(bag.result ?? 'unknown') : 'unknown'
            } else {
              const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit, user: def.category === 'dev' })
              nextUnits[def.id] = (s as { ok: boolean; result?: string }).ok ? String((s as { ok: boolean; result?: string }).result ?? 'unknown') : 'unknown'
            }
          } catch {
            nextUnits[def.id] = 'unknown'
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

  const startUnit = useCallback(async (def: KernelDef) => {
    setUnitBusy((prev) => ({ ...prev, [def.id]: true }))
    setUnitError((prev) => ({ ...prev, [def.id]: '' }))
    try {
      const res = await window.dh.hostExec({
        command: 'systemctl_start',
        unit: def.systemdUnit,
        user: def.category === 'dev',
      })
      const bag = res as { ok: boolean; error?: string }
      if (!bag.ok) setUnitError((prev) => ({ ...prev, [def.id]: bag.error ?? 'Failed to start' }))
      const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit, user: def.category === 'dev' })
      setUnits((prev) => ({ ...prev, [def.id]: String((s as { ok: boolean; result?: string }).result ?? 'unknown') }))
    } catch (e) {
      setUnitError((prev) => ({ ...prev, [def.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setUnitBusy((prev) => ({ ...prev, [def.id]: false }))
    }
  }, [])

  const stopUnit = useCallback(async (def: KernelDef) => {
    setUnitBusy((prev) => ({ ...prev, [def.id]: true }))
    setUnitError((prev) => ({ ...prev, [def.id]: '' }))
    try {
      const res = await window.dh.hostExec({
        command: 'systemctl_stop',
        unit: def.systemdUnit,
        user: def.category === 'dev',
      })
      const bag = res as { ok: boolean; error?: string }
      if (!bag.ok) setUnitError((prev) => ({ ...prev, [def.id]: bag.error ?? 'Failed to stop' }))
      const s = await window.dh.hostExec({ command: 'systemctl_is_active', unit: def.systemdUnit, user: def.category === 'dev' })
      setUnits((prev) => ({ ...prev, [def.id]: String((s as { ok: boolean; result?: string }).result ?? 'unknown') }))
    } catch (e) {
      setUnitError((prev) => ({ ...prev, [def.id]: e instanceof Error ? e.message : String(e) }))
    } finally {
      setUnitBusy((prev) => ({ ...prev, [def.id]: false }))
    }
  }, [])

  const linkProject = useCallback(async (def: KernelDef) => {
    try {
      const path = await window.dh.selectFolder()
      if (!path || typeof path !== 'string') return
      const next = { ...kernelLinks, [def.id]: path }
      setKernelLinks(next)
      await window.dh.storeSet({ key: 'kernel_links', data: next })
    } catch { /* ignore */ }
  }, [kernelLinks])

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
            {t('kernels.pageTitle')}
          </div>
          <h1 className="kernels-title">{t('kernels.heading')}</h1>
          <p className="kernels-subtitle">
            {t('kernels.subtitle')}
          </p>
        </div>
        <div className="kernels-toolbar">
          {lastRefreshed && (
            <span className="kernels-updated">
              {t('kernels.lastCheck', { time: lastRefreshed.toLocaleTimeString() })}
            </span>
          )}
          <button
            type="button"
            className="kernels-btn"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <span className={`codicon ${busy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
            {busy ? t('kernels.refreshing') : t('kernels.refreshNow')}
          </button>
        </div>
      </div>

      {/* ── System Services ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {t('kernels.systemServices')}
        </h3>
        <div className="kernels-grid">
          {KERNEL_DEFS.filter((d) => d.category === 'system').map((def) => (
            <KernelCard
              key={def.id}
              def={def}
              status={units[def.id] ?? 'unknown'}
              busy={unitBusy[def.id] ?? false}
              error={unitError[def.id] ?? ''}
              linkedPath={kernelLinks[def.id]}
              onStart={() => void startUnit(def)}
              onStop={() => void stopUnit(def)}
              onLink={() => void linkProject(def)}
            />
          ))}
        </div>
      </section>

      {/* ── Development Kernels ── */}
      <section>
        <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 12px' }}>
          {t('kernels.devKernels')}
        </h3>
        <div className="kernels-grid">
          {KERNEL_DEFS.filter((d) => d.category === 'dev').map((def) => (
            <KernelCard
              key={def.id}
              def={def}
              status={units[def.id] ?? 'unknown'}
              busy={unitBusy[def.id] ?? false}
              error={unitError[def.id] ?? ''}
              linkedPath={kernelLinks[def.id]}
              onStart={() => void startUnit(def)}
              onStop={() => void stopUnit(def)}
              onLink={() => void linkProject(def)}
            />
          ))}
        </div>
      </section>

      {/* ── Main Two-Column Grid ── */}
      <div className="kernels-dashboard-grid">
        {/* Left Column: Runtimes & Security */}
        <div className="kernels-main-col">
          {/* Development Kernels & Toolchains */}
          <div className="kernels-card-container">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-terminal" style={{ color: 'var(--accent)' }} />
              {t('kernels.devKernels')}
            </div>
            {runtimes.length > 0 ? (
              <div className="kernels-audit-list">
                {runtimes.map((r, i) => (
                  <div
                    key={r.id}
                    className="kernels-audit-row"
                    style={{ borderBottom: i < runtimes.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div className="kernels-audit-label">
                      <span className={`codicon ${r.installed ? 'codicon-check-all' : 'codicon-close'}`} style={{ fontSize: 14, color: r.installed ? 'var(--green)' : 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      {r.version && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({r.version})</span>}
                    </div>
                    <div
                      className="kernels-audit-badge"
                      style={{
                        color: r.installed ? 'var(--green)' : 'var(--text-muted)',
                        background: r.installed ? 'rgba(63, 185, 80, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${r.installed ? 'rgba(63, 185, 80, 0.2)' : 'rgba(255, 255, 255, 0.08)'}`,
                      }}
                    >
                      {r.installed ? t('kernels.active') : t('kernels.notInstalled')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {runtimesLoaded ? t('kernels.noRuntimes') : t('kernels.loadingRuntimes')}
              </div>
            )}
          </div>

          {/* Security Section */}
          {security && (
            <div className="kernels-card-container">
              <div className="kernels-card-header-title">
                <span className="codicon codicon-shield" style={{ color: 'var(--accent)' }} />
                {t('kernels.securityAudit')}
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
              {t('kernels.gpuHardware')}
            </div>
            <div className="kernels-gpu-info">
              <div className="kernels-gpu-icon-huge">
                <span className="codicon codicon-circuit-board" />
              </div>
              <div className="kernels-gpu-details">
                <span className="kernels-gpu-label">{t('kernels.activeGraphicsProbe')}</span>
                <span className="kernels-gpu-value">{gpu || t('kernels.detectingGpu')}</span>
              </div>
            </div>
          </div>

          {/* Port Link Controls */}
          <div className="kernels-card-container">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-link-external" style={{ color: 'var(--accent)' }} />
              {t('kernels.activePortBindings')}
            </div>
            {ports.length > 0 ? (
              <div className="kernels-audit-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {ports.map((p, i) => (
                  <div
                    key={`${p.protocol}-${p.port}`}
                    className="kernels-audit-row"
                    style={{ borderBottom: i < ports.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div className="kernels-audit-label">
                      <span className="codicon codicon-radio-tower" style={{ fontSize: 14, color: 'var(--accent)' }} />
                      <span className="mono" style={{ fontWeight: 600 }}>:{p.port}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({p.service})</span>
                    </div>
                    {p.protocol === 'tcp' && HTTP_PORTS.has(p.port) ? (
                      <a
                        href={`http://localhost:${p.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="kernels-audit-badge"
                        style={{
                          color: 'var(--accent)',
                          background: 'rgba(124, 77, 255, 0.08)',
                          border: '1px solid rgba(124, 77, 255, 0.2)',
                          cursor: 'pointer',
                          textDecoration: 'none',
                        }}
                      >
                        {t('kernels.openLink')}
                      </a>
                    ) : (
                      <div
                        className="kernels-audit-badge"
                        style={{
                          color: 'var(--text-muted)',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        {p.protocol.toUpperCase()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('kernels.noPorts')}
              </p>
            )}
          </div>

          {/* Risky Ports Warnings */}
          {security && (security.riskyOpenPorts?.length ?? 0) > 0 ? (
            <div className="kernels-alert-container error">
              <div className="kernels-alert-title">
                <span className="codicon codicon-warning" />
                {t('kernels.riskyPortsTitle')}
              </div>
              <p className="kernels-alert-desc">
                {t('kernels.riskyPortsDesc')}
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
                {t('kernels.networkSecured')}
              </div>
              <p className="kernels-alert-desc">
                {t('kernels.noRiskyPorts')}
              </p>
            </div>
          )}

          {/* Quick Info / Tips */}
          <div className="kernels-card-container kernels-tips-card">
            <div className="kernels-card-header-title">
              <span className="codicon codicon-info" style={{ color: 'var(--accent)' }} />
              {t('kernels.toolchainTip')}
            </div>
            <p className="kernels-tip-text">
              <Trans t={t} i18nKey="kernels.toolchainTipText">
                Ensure system-level dependencies like <code>docker-compose</code> and <code>ssh-agent</code> are configured and accessible by the active profile.
              </Trans>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
