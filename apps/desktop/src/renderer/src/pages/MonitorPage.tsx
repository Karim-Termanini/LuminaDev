import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { ContainerRow, HostMetricsResponse, HostPortRow, HostSecurityDrilldown, HostSecuritySnapshot, HostSysInfo, TopProcessRow } from '@linux-dev-home/shared'
import { humanizeDashboardError } from './dashboardError'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'
import { assertMonitorOk } from './monitorContract'
import {
  getMonitorHealthColor,
  getMonitorHealthDescription,
  getMonitorHealthLevel,
  type MonitorHealthMetric,
} from './monitorHealth'
import './MonitorPage.css'

// ─── Git global config score (aligned with Git Config page) ─────────────────

function gitIdentityScore(cfg: Map<string, string>): number {
  let s = 0
  if (cfg.get('user.name')?.trim()) s += 40
  if (cfg.get('user.email')?.trim()) s += 40
  if (cfg.get('init.defaultbranch')?.trim()) s += 20
  return s
}

function gitSecurityScore(cfg: Map<string, string>): number {
  let s = 0
  const helper = cfg.get('credential.helper') ?? ''
  if (/libsecret|manager|osxkeychain|gnome|wincred|secretservice/.test(helper)) s += 35
  else if (/cache/.test(helper)) s += 15
  else if (/store/.test(helper)) s += 5
  if (cfg.get('commit.gpgsign') === 'true') s += 35
  if (cfg.get('http.sslverify') !== 'false') s += 30
  return Math.min(s, 100)
}

function gitPerformanceScore(cfg: Map<string, string>): number {
  let s = 40
  if (cfg.get('core.preloadindex') === 'true') s += 25
  if (cfg.get('core.fscache') === 'true') s += 20
  if (cfg.get('pull.rebase') === 'true') s += 15
  return Math.min(s, 100)
}

function gitCompatibilityScore(cfg: Map<string, string>): number {
  let s = 40
  if (cfg.get('fetch.prune') === 'true') s += 25
  const autocrlf = cfg.get('core.autocrlf')
  if (autocrlf === 'input') s += 25
  else if (autocrlf === 'false') s += 10
  if (cfg.get('init.defaultbranch') === 'main') s += 10
  return Math.min(s, 100)
}

function gitTotalConfigScore(cfg: Map<string, string>): number {
  return Math.round(
    (gitIdentityScore(cfg) + gitSecurityScore(cfg) + gitPerformanceScore(cfg) + gitCompatibilityScore(cfg)) / 4
  )
}

function gitConfigScoreMessage(total: number, t: (key: string) => string): string {
  if (total >= 80) return t('config.well_configured')
  if (total >= 50) return t('config.some_improvements')
  return t('config.needs_attention')
}

function gitScoreColor(total: number): string {
  if (total >= 80) return '#22c55e'
  if (total >= 50) return '#f59e0b'
  return '#ef4444'
}

/** Score tile for Git config section. */
function MonitorGitScoreTile({
  title,
  score,
  subtitle,
}: {
  title: string
  score: number
  subtitle: string
}): ReactElement {
  const color = gitScoreColor(score)
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="hp-card monitor-git-score-tile">
      <div className="monitor-git-score-value" style={{ color }}>{score}</div>
      <div className="monitor-git-score-bar">
        <div className="monitor-git-score-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="monitor-git-score-title">{title}</div>
      <div className="hp-muted" style={{ fontSize: 11 }}>{subtitle}</div>
    </div>
  )
}

type MonitorTabId = 'overview' | 'processes' | 'docker' | 'disk' | 'network'

const MONITOR_TABS: Array<{ id: MonitorTabId; labelKey: string; icon: string; anchorId: string }> = [
  { id: 'overview', labelKey: 'tabs.overview', icon: 'dashboard', anchorId: 'monitor-overview' },
  { id: 'processes', labelKey: 'tabs.processes', icon: 'server-process', anchorId: 'monitor-processes' },
  { id: 'docker', labelKey: 'tabs.docker', icon: 'vm', anchorId: 'monitor-docker' },
  { id: 'disk', labelKey: 'tabs.disk', icon: 'save', anchorId: 'monitor-disk' },
  { id: 'network', labelKey: 'tabs.network', icon: 'globe', anchorId: 'monitor-network' },
]

function MetricHealthHint({
  metric,
  value,
  t,
}: {
  metric: MonitorHealthMetric
  value: number | null | undefined
  t: (key: string, opts?: Record<string, unknown>) => string
}): ReactElement | null {
  const level = getMonitorHealthLevel(metric, value)
  const description = getMonitorHealthDescription(metric, value, t)
  if (!level || !description) return null
  return (
    <div className={`monitor-health-hint is-${level}`} role="status">
      <span className="monitor-health-dot" style={{ background: getMonitorHealthColor(level) }} aria-hidden />
      {description}
    </div>
  )
}

export function MonitorPage(): ReactElement {
  const { t } = useTranslation('monitor')
  const [metrics, setMetrics] = useState<HostMetricsResponse | null>(null)
  const [ports, setPorts] = useState<HostPortRow[]>([])
  const [sysInfo, setSysInfo] = useState<HostSysInfo | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(30).fill(0))
  const [netHistory, setNetHistory] = useState<{ rx: number, tx: number }[]>(new Array(30).fill({ rx: 0, tx: 0 }))
  const [gitCfg, setGitCfg] = useState<Map<string, string> | null>(null)
  const [gitCfgError, setGitCfgError] = useState<string | null>(null)
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [dockerNetworkCount, setDockerNetworkCount] = useState(0)
  const [topProcesses, setTopProcesses] = useState<TopProcessRow[]>([])
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [securityDrilldown, setSecurityDrilldown] = useState<HostSecurityDrilldown | null>(null)
  const [copiedReport, setCopiedReport] = useState(false)
  const [activeTab, setActiveTab] = useState<MonitorTabId>('overview')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [portsView, setPortsView] = useState<'listen' | 'all'>('all')
  const [monitorError, setMonitorError] = useState<string | null>(null)

  const refreshLive = useCallback(async () => {
    try {
      const res = await window.dh.metrics()
      assertMonitorOk<HostMetricsResponse, 'metrics'>(res, 'metrics', 'Failed to collect live metrics.')
      setMetrics(res)
      setCpuHistory((prev) => [...prev.slice(1), res.metrics.cpuUsagePercent])
      setNetHistory((prev) => [...prev.slice(1), { rx: res.metrics.netRxMbps, tx: res.metrics.netTxMbps }])

      const c = (await window.dh.dockerList()) as { ok: boolean; rows: ContainerRow[] }
      if (c.ok) setContainers(c.rows)
      const n = (await window.dh.dockerNetworksList()) as { ok: boolean; rows?: Array<{ id: string }> }
      if (n.ok) setDockerNetworkCount((n.rows ?? []).length)
      setMonitorError(null)
    } catch (e) {
      setMonitorError(humanizeDashboardError(e))
    }
  }, [])

  const refreshStatic = useCallback(async () => {
    try {
      const s = await window.dh.getHostSysInfo()
      setSysInfo(assertMonitorOk<HostSysInfo, 'info'>(s, 'info', 'Failed to collect host system info.'))

      const p = await window.dh.getHostPorts()
      setPorts(assertMonitorOk<HostPortRow[], 'ports'>(p, 'ports', 'Failed to collect host ports.'))

      const proc = await window.dh.monitorTopProcesses()
      setTopProcesses(
        assertMonitorOk<TopProcessRow[], 'processes'>(proc, 'processes', 'Failed to collect top processes.')
      )

      const sec = await window.dh.monitorSecurity()
      setSecurity(
        assertMonitorOk<HostSecuritySnapshot, 'snapshot'>(sec, 'snapshot', 'Failed to collect security snapshot.')
      )

      const drill = await window.dh.monitorSecurityDrilldown()
      setSecurityDrilldown(
        assertMonitorOk<HostSecurityDrilldown, 'drilldown'>(
          drill,
          'drilldown',
          'Failed to collect security drilldown.'
        )
      )

      try {
        const g = await window.dh.gitConfigList({ target: 'host' })
        assertGitOk(g, 'Failed to load Git config.')
        const rows = g.rows ?? []
        setGitCfg(new Map(rows.map((r) => [r.key.toLowerCase(), r.value])))
        setGitCfgError(null)
      } catch (e) {
        setGitCfg(null)
        setGitCfgError(humanizeGitError(e))
      }

      setMonitorError(null)
    } catch (e) {
      setMonitorError(humanizeDashboardError(e))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refreshStatic()
        await refreshLive()
      } catch (e) { console.error(e) }
    })()

    const fast = setInterval(() => { void refreshLive() }, 2000)
    const slow = setInterval(() => { void refreshStatic() }, 10000)
    return () => {
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [refreshLive, refreshStatic])

  const m = metrics?.metrics
  const memUsed = m ? m.totalMemMb - m.freeMemMb : 0
  const memPct = m ? Math.round((memUsed / m.totalMemMb) * 100) : 0
  const swapUsed = m ? Math.max(0, m.swapTotalMb - m.swapFreeMb) : 0
  const swapPct = m && m.swapTotalMb > 0 ? Math.round((swapUsed / m.swapTotalMb) * 100) : 0
  const diskPct = m ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : 0
  const visiblePortRows = ports
    .filter((p) => portsView === 'all' || p.state.toLowerCase().includes('listen'))
    .reduce<HostPortRow[]>((acc, cur) => {
      const idx = acc.findIndex((x) => x.protocol === cur.protocol && x.port === cur.port)
      if (idx === -1) {
        acc.push(cur)
      } else if (acc[idx].service === 'unknown' && cur.service !== 'unknown') {
        acc[idx] = cur
      }
      return acc
    }, [])
  const listeningPorts = ports.filter((p) => p.state.toLowerCase().includes('listen')).length
  const runningContainers = containers.filter((c) => c.state === 'running').length
  const dockerNetworks = dockerNetworkCount
  const alerts: string[] = []
  if (m && m.cpuUsagePercent >= 85) alerts.push(t('alerts.high_cpu', { value: m.cpuUsagePercent.toFixed(1) }))
  if (memPct >= 90) alerts.push(t('alerts.high_ram', { value: memPct }))
  if (swapPct >= 80 && (m?.swapTotalMb ?? 0) > 0) alerts.push(t('alerts.high_swap', { value: swapPct }))
  if ((security?.riskyOpenPorts?.length ?? 0) > 0) alerts.push(t('alerts.risky_ports', { ports: security?.riskyOpenPorts?.join(', ') }))
  if ((security?.failedAuth24h ?? 0) > 20) alerts.push(t('alerts.failed_ssh', { count: security?.failedAuth24h }))
  const securityRiskCount =
    (security?.firewall === 'inactive' ? 1 : 0) +
    (security?.sshPermitRootLogin === 'yes' ? 1 : 0) +
    (security?.sshPasswordAuth === 'yes' ? 1 : 0) +
    ((security?.riskyOpenPorts?.length ?? 0) > 0 ? 1 : 0) +
    ((security?.failedAuth24h ?? 0) > 20 ? 1 : 0)
  const copySystemReport = async () => {
    const report = [
      t('report.distro', { value: sysInfo?.distro ?? '—' }),
      t('report.hostname', { value: sysInfo?.hostname ?? '—' }),
      t('report.kernel', { value: sysInfo?.kernel ?? '—' }),
      t('report.architecture', { value: sysInfo?.arch ?? '—' }),
      t('report.packages', { value: sysInfo?.packages ?? '—' }),
      t('report.shell', { value: sysInfo?.shell ?? '—' }),
      t('report.desktop', { desktop: sysInfo?.de ?? '—', wm: sysInfo?.wm ?? '—' }),
      t('report.graphics', { value: sysInfo?.gpu ?? '—' }),
      t('report.display', { value: sysInfo?.resolution ?? '—' }),
      t('report.memory', { value: sysInfo?.memoryUsage ?? '—' }),
      t('report.swap', { used: m ? (swapUsed / 1024).toFixed(1) : '—', total: m ? (m.swapTotalMb / 1024).toFixed(1) : '—' }),
      t('report.uptime', { hours: m ? Math.floor(m.uptimeSec / 3600) : '—', minutes: m ? Math.floor((m.uptimeSec % 3600) / 60) : '—' }),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(report)
      setCopiedReport(true)
      setTimeout(() => setCopiedReport(false), 1500)
    } catch {
      setCopiedReport(false)
    }
  }

  function jumpToTab(tab: MonitorTabId): void {
    setActiveTab(tab)
    const entry = MONITOR_TABS.find((item) => item.id === tab)
    if (!entry) return
    if (tab === 'processes') {
      setDetailsOpen(true)
      window.setTimeout(() => {
        document.getElementById(entry.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
      return
    }
    document.getElementById(entry.anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const gitTotal = gitCfg ? gitTotalConfigScore(gitCfg) : null

  return (
    <div className="monitor-page elevated-page">
      <div className="monitor-scroll">
        <header className="monitor-hero">
          <div className="monitor-hero-eyebrow">
            <span className="codicon codicon-pulse" aria-hidden />
            {t('page.eyebrow')}
          </div>
          <div className="monitor-hero-row">
            <div>
              <h1 className="monitor-hero-title">{t('page.title')}</h1>
              <p className="monitor-hero-sub">{t('page.subtitle')}</p>
            </div>
            <div className="monitor-live-pill" role="status">
              <span className="monitor-live-dot" aria-hidden />
              {t('page.live')}
            </div>
          </div>
        </header>

        {monitorError ? <div className="monitor-alert-error" role="alert">{monitorError}</div> : null}

        <section className="monitor-spotlight" aria-label={t('summary.aria')}>
          <div className="monitor-spotlight-item">
            <span className="monitor-spotlight-label">{t('summary.cpu')}</span>
            <span className={`monitor-spotlight-value${m && m.cpuUsagePercent >= 85 ? ' is-warn' : ''}`}>
              {m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'}
            </span>
            <span className="monitor-spotlight-sub">{m?.cpuModel ?? t('summary.cpu_sub')}</span>
          </div>
          <div className="monitor-spotlight-item">
            <span className="monitor-spotlight-label">{t('summary.memory')}</span>
            <span className={`monitor-spotlight-value${memPct >= 90 ? ' is-warn' : ''}`}>
              {m ? `${memPct}%` : '—'}
            </span>
            <span className="monitor-spotlight-sub">
              {m ? t('metrics.ram_total', { size: (m.totalMemMb / 1024).toFixed(1) }) : '—'}
            </span>
          </div>
          <div className="monitor-spotlight-item">
            <span className="monitor-spotlight-label">{t('summary.containers')}</span>
            <span className="monitor-spotlight-value">{runningContainers}</span>
            <span className="monitor-spotlight-sub">{t('docker.running_total', { count: containers.length })}</span>
          </div>
          <div className="monitor-spotlight-item">
            <span className="monitor-spotlight-label">{t('summary.security')}</span>
            <span className={`monitor-spotlight-value${securityRiskCount === 0 ? ' is-ok' : ' is-warn'}`}>
              {securityRiskCount === 0 ? t('security.secure') : t('security.risks', { count: securityRiskCount })}
            </span>
            <span className="monitor-spotlight-sub">
              {alerts.length === 0 ? t('alerts.none') : t('summary.alerts_active', { count: alerts.length })}
            </span>
          </div>
        </section>

        <nav className="monitor-tabs" aria-label={t('tabs.aria')}>
          {MONITOR_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`monitor-tab-button${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => jumpToTab(tab.id)}
            >
              <span className={`codicon codicon-${tab.icon}`} aria-hidden />
              {t(tab.labelKey)}
            </button>
          ))}
        </nav>

      <div id="monitor-overview" className="monitor-grid-metrics monitor-grid-primary">
        <MetricCard
          title={t('metrics.cpu')}
          value={m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'}
          subValue={m?.cpuModel}
          icon="pulse"
          tone="cpu"
        >
          <MetricHealthHint metric="cpu" value={m?.cpuUsagePercent} t={t} />
          <LiveLineChart data={cpuHistory} color="var(--accent)" height={60} />
        </MetricCard>

        <MetricCard
          title={t('metrics.memory')}
          value={m ? `${memPct}%` : '—'}
          subValue={
            m
              ? `${(memUsed / 1024).toFixed(1)} / ${(m.totalMemMb / 1024).toFixed(1)} GB`
              : undefined
          }
          icon="server-environment"
          tone="memory"
        >
          <MetricHealthHint metric="ram" value={memPct} t={t} />
          <ProgressBar pct={memPct} variant="memory" />
          <div className="monitor-stat-row mono">
            <span>{t('metrics.used', { value: memUsed })}</span>
            <span>{t('metrics.free', { value: m?.freeMemMb })}</span>
          </div>
          <div className="monitor-panel-block-title" style={{ marginTop: 12 }}>{t('metrics.swap')}</div>
          <ProgressBar pct={swapPct} variant="swap" />
          <div className="monitor-stat-row mono">
            <span>{t('metrics.used', { value: swapUsed })}</span>
            <span>{t('metrics.swap_total', { value: m?.swapTotalMb ?? 0 })}</span>
          </div>
        </MetricCard>

        <MetricCard
          title={t('metrics.storage')}
          value={m ? `${diskPct}%` : '—'}
          subValue={t('metrics.root_partition', { size: m?.diskTotalGb })}
          icon="save"
          tone="storage"
        >
          <MetricHealthHint metric="disk" value={diskPct} t={t} />
          <div className="monitor-usage-ring-wrap">
            <UsageRing pct={diskPct} size={80} color="var(--orange)" />
          </div>
          <div className="monitor-storage-stats">
            <span>{t('metrics.storage_used', { size: m ? (m.diskTotalGb - m.diskFreeGb).toFixed(1) : '0' })}</span>
            <span>{t('metrics.storage_free', { size: m?.diskFreeGb ?? 0 })}</span>
          </div>
        </MetricCard>

        <MetricCard
          title={t('metrics.network')}
          value={`${m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps`}
          subValue={t('metrics.network_sub')}
          icon="globe"
          tone="network"
        >
          <div className="monitor-chart-frame">
            <NetworkChart data={netHistory} height={100} />
          </div>
          <div className="monitor-chart-legend">
            <div className="monitor-chart-legend-item">
              <div className="monitor-chart-legend-swatch is-rx" />
              <span>{t('metrics.rx', { value: m?.netRxMbps.toFixed(2) ?? '0.00' })}</span>
            </div>
            <div className="monitor-chart-legend-item">
              <div className="monitor-chart-legend-swatch is-tx" />
              <span>{t('metrics.tx', { value: m?.netTxMbps.toFixed(2) ?? '0.00' })}</span>
            </div>
          </div>
        </MetricCard>
      </div>

      <div id="monitor-network" aria-hidden className="monitor-anchor" />

      {/* Engineering Hub Row */}
      <div id="monitor-docker" className="monitor-grid-dual">
        <MetricCard
          title={t('docker.title')}
          value={`${runningContainers}`}
          subValue={t('docker.running_total', { count: containers.length })}
          icon="vm"
          tone="default"
        >
          <div className="monitor-scroll-container">
            {containers.length > 0 ? (
              <table className="monitor-table">
                <thead>
                  <tr>
                    <th>{t('docker.col_name')}</th>
                    <th>{t('docker.col_image')}</th>
                    <th>{t('docker.col_status')}</th>
                    <th>{t('docker.col_ports')}</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{c.name}</td>
                      <td className="hp-muted">{c.image.split('@')[0]}</td>
                      <td>
                        <span className={`monitor-mini-value ${c.state === 'running' ? 'is-ok' : ''}`} style={{ fontSize: 10, textTransform: 'uppercase' }}>
                          {c.state}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{c.ports}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="monitor-table-empty">{t('docker.empty')}</div>
            )}
          </div>
        </MetricCard>

        <MetricCard title={t('network.title')} icon="globe" tone="network">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sysInfo && (
              <>
                <div className="monitor-panel-block">
                  <div className="monitor-panel-block-title">{t('network.primary_adapter')}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>{sysInfo.ip ?? '—'}</div>
                  <div className="hp-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {t('network.host', { hostname: sysInfo.hostname })}
                  </div>
                </div>

                <div className="monitor-mini-grid">
                  <div className="monitor-mini-tile">
                    <div className="monitor-mini-label">{t('network.receive')}</div>
                    <div className="monitor-mini-value">{m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                  <div className="monitor-mini-tile">
                    <div className="monitor-mini-label">{t('network.send')}</div>
                    <div className="monitor-mini-value">{m?.netTxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                  <div className="monitor-mini-tile">
                    <div className="monitor-mini-label">{t('network.listening_ports')}</div>
                    <div className="monitor-mini-value is-ok">{listeningPorts}</div>
                  </div>
                  <div className="monitor-mini-tile">
                    <div className="monitor-mini-label">{t('network.docker_networks')}</div>
                    <div className="monitor-mini-value">{dockerNetworks}</div>
                  </div>
                </div>

                <p className="hp-muted" style={{ margin: 0, fontSize: 11 }}>
                  {t('network.active_containers', { count: runningContainers })}
                </p>
              </>
            )}
          </div>
        </MetricCard>
      </div>

      <MetricCard title={t('security.title')} subValue={t('security.subtitle')} icon="shield" tone="security">
        <div className="monitor-stack">
          <div className="monitor-panel-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div className="monitor-mini-label">{t('security.posture')}</div>
            <span className={`monitor-status-pill ${securityRiskCount === 0 ? 'is-ok' : 'is-warn'}`}>
              {securityRiskCount === 0 ? t('security.secure') : t('security.risks', { count: securityRiskCount })}
            </span>
          </div>

          <div className="monitor-mini-grid">
            <MiniStatus label={t('security.firewall')} value={security?.firewall ?? 'unknown'} ok={security?.firewall === 'active'} />
            <MiniStatus label={t('security.selinux')} value={security?.selinux ?? 'unknown'} ok={(security?.selinux ?? '').toLowerCase() === 'enforcing'} />
            <MiniStatus label={t('security.failed_auth')} value={String(security?.failedAuth24h ?? 0)} ok={(security?.failedAuth24h ?? 0) < 20} />
          </div>

          <div className="monitor-stack">
            <SettingsRow label={t('security.firewall_ufw')} value={security?.firewall ?? 'unknown'} />
            <SettingsRow label={t('security.selinux')} value={security?.selinux ?? 'unknown'} />
            <SettingsRow label={t('security.ssh_root_login')} value={security?.sshPermitRootLogin ?? 'unknown'} />
            <SettingsRow label={t('security.ssh_password_auth')} value={security?.sshPasswordAuth ?? 'unknown'} />
            <SettingsRow label={t('security.failed_auth')} value={String(security?.failedAuth24h ?? 0)} />
            <SettingsRow label={t('security.risky_ports')} value={(security?.riskyOpenPorts?.length ?? 0) > 0 ? security!.riskyOpenPorts.join(', ') : t('security.none')} />
            <div className="monitor-panel-block" style={{ maxHeight: 180, overflow: 'auto' }}>
              <div className="monitor-panel-block-title">{t('security.failed_auth_samples')}</div>
              {(securityDrilldown?.failedAuthSamples.length ?? 0) === 0 ? (
                <div className="hp-muted" style={{ fontSize: 12 }}>{t('security.no_failed_auth')}</div>
              ) : (
                <div className="monitor-stack">
                  {securityDrilldown?.failedAuthSamples.map((line, i) => (
                    <div key={i} className="monitor-log-line">{line}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="monitor-panel-block" style={{ maxHeight: 160, overflow: 'auto' }}>
              <div className="monitor-panel-block-title">{t('security.risky_port_owners')}</div>
              {(securityDrilldown?.riskyPortOwners.length ?? 0) === 0 ? (
                <div className="hp-muted" style={{ fontSize: 12 }}>{t('security.no_risky_port_owners')}</div>
              ) : (
                <div className="monitor-stack">
                  {securityDrilldown?.riskyPortOwners.map((p, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      {p.pid
                        ? t('security.port_process_pid', { port: p.port, process: p.process, pid: p.pid })
                        : t('security.port_process', { port: p.port, process: p.process })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </MetricCard>

      <section className="monitor-details">
        <button
          type="button"
          className="monitor-details-toggle"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          <span className={`codicon codicon-chevron-${detailsOpen ? 'down' : 'right'}`} aria-hidden />
          <span className="monitor-details-toggle-text">
            <strong>{t('details.title')}</strong>
            <span className="hp-muted">{t('details.subtitle')}</span>
          </span>
          <span className="monitor-details-toggle-action hp-muted">
            {detailsOpen ? t('details.collapse') : t('details.expand')}
          </span>
        </button>

        {detailsOpen ? (
          <div className="monitor-details-body">
            <MetricCard title={t('details.processes')} subValue={t('processes.subtitle')} icon="server-process" tone="process">
              <div id="monitor-processes" className="monitor-scroll-container" style={{ maxHeight: 322 }}>
                <table className="monitor-table">
                  <thead>
                    <tr>
                      <th>{t('processes.pid')}</th>
                      <th>{t('processes.command')}</th>
                      <th>{t('processes.cpu')}</th>
                      <th>{t('processes.mem')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProcesses.map((p) => (
                      <tr key={p.pid}>
                        <td className="mono">{p.pid}</td>
                        <td style={{ fontWeight: 700 }}>{p.command}</td>
                        <td style={{ fontWeight: 700 }}>{p.cpuPercent.toFixed(1)}</td>
                        <td style={{ fontWeight: 700 }}>{p.memPercent.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </MetricCard>

            <MetricCard
              title={t('details.ports')}
              value={`${visiblePortRows.length}`}
              subValue={portsView === 'listen' ? t('ports.sub_listen') : t('ports.sub_all')}
              icon="radio-tower"
              tone="network"
            >
              <div className="monitor-scroll-container">
                <div className="monitor-segmented">
                  <button
                    type="button"
                    className={`hp-btn monitor-segmented-btn${portsView === 'listen' ? ' is-active' : ''}`}
                    onClick={() => setPortsView('listen')}
                  >
                    {t('ports.btn_listen')}
                  </button>
                  <button
                    type="button"
                    className={`hp-btn monitor-segmented-btn${portsView === 'all' ? ' is-active' : ''}`}
                    onClick={() => setPortsView('all')}
                  >
                    {t('ports.btn_all')}
                  </button>
                </div>
                <p className="hp-muted" style={{ margin: '0 0 10px', fontSize: 11 }}>{t('ports.auto_refresh')}</p>
                <table className="monitor-table">
                  <thead>
                    <tr>
                      <th>{t('ports.col_proto')}</th>
                      <th>{t('ports.col_port')}</th>
                      <th>{t('ports.col_state')}</th>
                      <th>{t('ports.col_process')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePortRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="monitor-table-empty">{t('ports.empty')}</td>
                      </tr>
                    ) : (
                      visiblePortRows.slice(0, 25).map((p, i) => {
                        const isListening = p.state.toLowerCase().includes('listen')
                        return (
                          <tr key={i} title={t('ports.row_hint', { port: p.port, service: p.service || t('ports.unknown') })}>
                            <td className="mono">{p.protocol.toUpperCase()}</td>
                            <td style={{ fontWeight: 700 }}>{p.port}</td>
                            <td>
                              <span className={`monitor-state-badge ${isListening ? 'is-listen' : 'is-other'}`}>
                                {p.state}
                              </span>
                            </td>
                            <td className="mono">{p.service || t('ports.unknown')}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </MetricCard>

            <MetricCard title={t('details.sysinfo')} icon="info" tone="default">
              <div className="monitor-stack">
                <div className="monitor-panel-block">
                  <div className="monitor-panel-block-title">{t('sysinfo.about')}</div>
                  <div style={{ marginTop: 4, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{sysInfo?.distro ?? '—'}</div>
                  <div className="hp-muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {t('sysinfo.hostname', { hostname: sysInfo?.hostname ?? '—' })}
                  </div>
                  <button type="button" className="hp-btn" style={{ marginTop: 10, fontSize: 11 }} onClick={() => void copySystemReport()}>
                    {copiedReport ? t('sysinfo.copied') : t('sysinfo.copy')}
                  </button>
                </div>
                <div className="monitor-stack">
                  <SettingsRow label={t('sysinfo.kernel')} value={sysInfo?.kernel} />
                  <SettingsRow label={t('sysinfo.architecture')} value={sysInfo?.arch} />
                  <SettingsRow label={t('sysinfo.packages')} value={sysInfo?.packages} />
                  <SettingsRow label={t('sysinfo.shell')} value={sysInfo?.shell} />
                  <SettingsRow label={t('sysinfo.desktop')} value={sysInfo?.de} />
                  <SettingsRow label={t('sysinfo.session')} value={sysInfo?.wm} />
                </div>
                <div className="monitor-panel-block">
                  <div className="monitor-panel-block-title">{t('sysinfo.specs')}</div>
                  <div className="monitor-stack" style={{ marginTop: 8 }}>
                    <SettingsRow label={t('sysinfo.graphics')} value={sysInfo?.gpu} />
                    <SettingsRow label={t('sysinfo.display')} value={sysInfo?.resolution} />
                    <SettingsRow label={t('sysinfo.ram')} value={sysInfo?.memoryUsage} />
                    <SettingsRow
                      label={t('sysinfo.uptime')}
                      value={m ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m` : '—'}
                    />
                  </div>
                </div>
              </div>
            </MetricCard>
          </div>
        ) : null}
      </section>

      <div className="monitor-grid-wide">
        <MetricCard
          title={t('config.title')}
          value={gitTotal !== null ? String(gitTotal) : '—'}
          subValue={
            gitCfgError && !gitCfg
              ? gitCfgError
              : gitTotal !== null
                ? gitConfigScoreMessage(gitTotal, t)
                : t('config.loading')
          }
          minHeight={560}
          icon="source-control"
          tone="git"
          valueColor={gitTotal !== null ? gitScoreColor(gitTotal) : undefined}
          valueClassName={undefined}
        >
          <div className="monitor-stack">
            <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>{t('config.based_on')}</p>
            {gitCfg ? (
              <>
                <div className="monitor-git-scores">
                  <MonitorGitScoreTile title={t('config.identity')} score={gitIdentityScore(gitCfg)} subtitle={t('config.identity_sub')} />
                  <MonitorGitScoreTile title={t('config.security')} score={gitSecurityScore(gitCfg)} subtitle={t('config.security_sub')} />
                  <MonitorGitScoreTile title={t('config.performance')} score={gitPerformanceScore(gitCfg)} subtitle={t('config.performance_sub')} />
                  <MonitorGitScoreTile title={t('config.compatibility')} score={gitCompatibilityScore(gitCfg)} subtitle={t('config.compatibility_sub')} />
                </div>
                <Link to="/git" className="hp-btn hp-btn-primary" style={{ fontSize: 13, textDecoration: 'none', alignSelf: 'flex-start' }}>
                  {t('config.open')}
                </Link>
              </>
            ) : null}
          </div>
        </MetricCard>
      </div>

      <div id="monitor-disk" className="monitor-grid-dual">
        <div className="monitor-stack">
          <MetricCard
            title={t('disk.title')}
            value={`${m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps`}
            subValue={t('disk.subtitle')}
            icon="save"
            tone="storage"
          >
            <div className="monitor-mini-grid">
              <div className="monitor-mini-tile">
                <div className="monitor-mini-label">{t('disk.read')}</div>
                <div className="monitor-mini-value is-ok">{m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
              <div className="monitor-mini-tile">
                <div className="monitor-mini-label">{t('disk.write')}</div>
                <div className="monitor-mini-value is-warn">{m?.diskWriteMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
            </div>
          </MetricCard>

          <MetricCard title={t('alerts.title')} value={`${alerts.length}`} subValue={t('alerts.subtitle')} icon="warning" tone="security">
            <div className="monitor-stack">
              {alerts.length === 0 ? (
                <div className="monitor-alert-none">{t('alerts.none')}</div>
              ) : (
                alerts.map((a, i) => (
                  <div key={i} className="monitor-alert-item">{a}</div>
                ))
              )}
            </div>
          </MetricCard>
        </div>
      </div>
      </div>
    </div>
  )
}

type MetricTone = 'default' | 'cpu' | 'memory' | 'storage' | 'network' | 'security' | 'process' | 'git'

function MetricCard({
  title,
  value,
  subValue,
  children,
  minHeight,
  icon,
  tone = 'default',
  valueClassName,
  valueColor,
}: {
  title: string
  value?: string
  subValue?: string
  children?: ReactNode
  minHeight?: number
  icon?: string
  tone?: MetricTone
  valueClassName?: string
  valueColor?: string
}): ReactElement {
  return (
    <section className={`monitor-metric-card monitor-tone-${tone}`} style={{ minHeight }}>
      <div className="monitor-metric-card-bar" />
      <div className="monitor-metric-head">
        {icon ? (
          <div className="monitor-metric-icon-wrap">
            <span className={`codicon codicon-${icon}`} aria-hidden />
          </div>
        ) : null}
        <div className="monitor-metric-head-text">
          <div className="monitor-metric-title">{title}</div>
          {value ? (
            <div
              className={`monitor-metric-value${valueClassName ? ` ${valueClassName}` : ''}`}
              style={valueColor ? { color: valueColor } : undefined}
            >
              {value}
            </div>
          ) : null}
          {subValue ? <div className="monitor-metric-subtitle">{subValue}</div> : null}
        </div>
      </div>
      {children ? <div className="monitor-metric-body">{children}</div> : null}
    </section>
  )
}

function ProgressBar({ pct, variant }: { pct: number; variant: 'memory' | 'swap' }): ReactElement {
  return (
    <div className="monitor-progress-bar">
      <div className={`monitor-progress-fill is-${variant}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function UsageRing({ pct, size, color }: { pct: number; size: number; color: string }): ReactElement {
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div className="monitor-usage-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="color-mix(in srgb, var(--border) 70%, transparent)" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="monitor-usage-ring-label">{pct}%</div>
    </div>
  )
}

function LiveLineChart({ data, color, height }: { data: number[], color: string, height: number }): ReactElement {
  const max = 100
  const points = data.map((val, i) => `${(i / (data.length - 1)) * 100},${height - (val / max) * height}`).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
        style={{ transition: 'all 0.3s ease' }}
      />
      <path
        d={`M 0 ${height} L ${points} L 100 ${height} Z`}
        fill={`url(#grad-${color.replace(/[()#,]/g, '')})`}
        style={{ opacity: 0.2 }}
      />
      <defs>
        <linearGradient id={`grad-${color.replace(/[()#,]/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function NetworkChart({ data, height }: { data: { rx: number, tx: number }[], height: number }): ReactElement {
  const max = Math.max(...data.map(d => Math.max(d.rx, d.tx, 1)), 1)
  const rxPoints = data.map((val, i) => `${(i / (data.length - 1)) * 100},${height - (val.rx / max) * height}`).join(' ')
  const txPoints = data.map((val, i) => `${(i / (data.length - 1)) * 100},${height - (val.tx / max) * height}`).join(' ')
  const lastRx = data[data.length - 1]
  const lastX = 100
  const lastRxY = height - ((lastRx?.rx ?? 0) / max) * height
  const lastTxY = height - ((lastRx?.tx ?? 0) / max) * height

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={rxPoints} />
      <polyline fill="none" stroke="#ff1744" strokeWidth="2.5" points={txPoints} strokeDasharray="4 2" />
      <circle cx={lastX} cy={lastRxY} r="1.6" fill="var(--accent)" />
      <circle cx={lastX} cy={lastTxY} r="1.6" fill="#ff1744" />
    </svg>
  )
}

function SettingsRow({ label, value }: { label: string; value?: string }): ReactElement {
  return (
    <div className="monitor-settings-row">
      <div className="monitor-settings-label">{label}</div>
      <div className="monitor-settings-value">{value ?? '—'}</div>
    </div>
  )
}

function MiniStatus({ label, value, ok }: { label: string; value: string; ok: boolean }): ReactElement {
  return (
    <div className="monitor-mini-tile">
      <div className="monitor-mini-label">{label}</div>
      <div className={`monitor-mini-value ${ok ? 'is-ok' : 'is-warn'}`}>{value}</div>
    </div>
  )
}

