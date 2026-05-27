import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { ContainerRow, HostMetricsResponse, HostPortRow, HostSecurityDrilldown, HostSecuritySnapshot, HostSysInfo, TopProcessRow } from '@linux-dev-home/shared'
import { humanizeDashboardError } from './dashboardError'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'
import { assertMonitorOk } from './monitorContract'
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

/** Same layout as Git Config score tiles: elevated card, bar, title, subtitle. */
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
    <div
      className="hp-card"
      style={{
        flex: '1 1 200px',
        minWidth: 168,
        maxWidth: '100%',
        textAlign: 'center',
        padding: '20px 16px',
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 700, color, letterSpacing: -1 }}>{score}</div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, margin: '10px 0' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div className="hp-muted" style={{ fontSize: 11 }}>{subtitle}</div>
    </div>
  )
}

type MonitorTabId = 'overview' | 'processes' | 'docker' | 'disk' | 'network'

const MONITOR_TABS: Array<{ id: MonitorTabId; label: string; anchorId: string }> = [
  { id: 'overview', label: 'Overview', anchorId: 'monitor-overview' },
  { id: 'processes', label: 'Processes', anchorId: 'monitor-processes' },
  { id: 'docker', label: 'Docker', anchorId: 'monitor-docker' },
  { id: 'disk', label: 'Disk', anchorId: 'monitor-disk' },
  { id: 'network', label: 'Network', anchorId: 'monitor-network' },
]

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
    const entry = MONITOR_TABS.find((t) => t.id === tab)
    if (!entry) return
    const node = document.getElementById(entry.anchorId)
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const gitTotal = gitCfg ? gitTotalConfigScore(gitCfg) : null

  return (
    <div className="monitor-page elevated-page">
      <header>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{t('page.title')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t('page.subtitle')}</p>
      </header>
      {monitorError ? (
        <div
          style={{
            padding: '10px 12px',
            border: '1px solid rgba(255, 183, 77, 0.35)',
            background: 'rgba(255, 183, 77, 0.14)',
            color: '#ffcc80',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {monitorError}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {MONITOR_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => jumpToTab(tab.id)}
            style={{
              border: '1px solid var(--border)',
              background: activeTab === tab.id ? 'rgba(124,77,255,0.2)' : 'var(--bg-input)',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text)',
              borderRadius: 8,
              padding: '8px 12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('tabs.' + tab.id)}
          </button>
        ))}
      </div>

      {/* Primary Metrics Row */}
      <div id="monitor-overview" className="monitor-grid-metrics">
        <MetricCard title={t('metrics.cpu')} value={m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'} subValue={m?.cpuModel}>
          <LiveLineChart data={cpuHistory} color="var(--accent)" height={60} />
        </MetricCard>

        <MetricCard title={t('metrics.memory')} value={m ? `${(memUsed / 1024).toFixed(1)} GB` : '—'} subValue={t('metrics.ram_total', { size: ((m?.totalMemMb ?? 0) / 1024).toFixed(1) })}>
          <ProgressBar pct={memPct} color="#00e676" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.6 }} className="mono">
            <span>{t('metrics.used', { value: memUsed })}</span>
            <span>{t('metrics.free', { value: m?.freeMemMb })}</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>{t('metrics.swap')}</div>
          <ProgressBar pct={swapPct} color="#42a5f5" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.6 }} className="mono">
            <span>{t('metrics.used', { value: swapUsed })}</span>
            <span>{t('metrics.swap_total', { value: m?.swapTotalMb ?? 0 })}</span>
          </div>
        </MetricCard>

        <MetricCard title={t('metrics.storage')} value={m ? `${(m.diskTotalGb - m.diskFreeGb).toFixed(1)} GB` : '—'} subValue={t('metrics.root_partition', { size: m?.diskTotalGb })}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <UsageRing pct={diskPct} size={80} color="var(--orange)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>{t('metrics.storage_used', { size: m ? (m.diskTotalGb - m.diskFreeGb).toFixed(1) : '0' })}</span>
            <span>{t('metrics.storage_free', { size: m?.diskFreeGb ?? 0 })}</span>
          </div>
        </MetricCard>
      </div>

      {/* Network Activity */}
      <div id="monitor-network" className="monitor-grid-wide">
        <MetricCard title={t('metrics.network')} value={`${m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps`} subValue={t('metrics.network_sub')}>
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,0.02)', padding: 10 }}>
            <NetworkChart data={netHistory} height={120} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent)' }} />
              <span style={{ fontSize: 12 }}>{t('metrics.rx', { value: m?.netRxMbps.toFixed(2) ?? '0.00' })}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ff1744' }} />
              <span style={{ fontSize: 12 }}>{t('metrics.tx', { value: m?.netTxMbps.toFixed(2) ?? '0.00' })}</span>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Engineering Hub Row - 2 Columns */}
      <div id="monitor-docker" className="monitor-grid-dual">
        <MetricCard
          title={portsView === 'listen' ? t('ports.title_listen') : t('ports.title_all')}
          value={`${visiblePortRows.length}`}
          subValue={portsView === 'listen' ? t('ports.sub_listen') : t('ports.sub_all')}
          titleColor="#66bb6a"
          valueColor="#81c784"
        >
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                className="hp-btn"
                onClick={() => setPortsView('listen')}
                style={{ opacity: portsView === 'listen' ? 1 : 0.65 }}
              >
                {t('ports.btn_listen')}
              </button>
              <button
                type="button"
                className="hp-btn"
                onClick={() => setPortsView('all')}
                style={{ opacity: portsView === 'all' ? 1 : 0.65 }}
              >
                {t('ports.btn_all')}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              {t('ports.auto_refresh')}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 4px' }}>{t('ports.col_proto')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('ports.col_port')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('ports.col_state')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('ports.col_process')}</th>
                </tr>
              </thead>
              <tbody>
                {visiblePortRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '12px 4px', color: 'var(--text-muted)' }}>
                      {t('ports.empty')}
                    </td>
                  </tr>
                ) : (
                  visiblePortRows.slice(0, 25).map((p, i) => {
                  const isListening = p.state.toLowerCase().includes('listen')
                  const stateColor = isListening ? 'var(--green)' : '#ffb74d'
                  const stateBg = isListening ? 'rgba(0,230,118,0.12)' : 'rgba(255,183,77,0.14)'
                  return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px', color: p.protocol === 'tcp' ? '#4fc3f7' : '#ba68c8' }} className="mono">{p.protocol.toUpperCase()}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 600 }}>{p.port}</td>
                    <td style={{ padding: '8px 4px' }}>
                      <span style={{ color: stateColor, background: stateBg, border: `1px solid ${stateColor}55`, borderRadius: 999, padding: '2px 8px', fontWeight: 700, fontSize: 11 }}>
                        {p.state}
                      </span>
                    </td>
                    <td style={{ padding: '8px 4px' }} className="mono">{p.service || t('ports.unknown')}</td>
                  </tr>
                  )
                  })
                )}
              </tbody>
            </table>
          </div>
        </MetricCard>

        <MetricCard title={t('docker.title')} value={`${runningContainers}`} subValue={t('docker.running_total', { count: containers.length })}>
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
            {containers.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 4px' }}>{t('docker.col_name')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('docker.col_image')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('docker.col_status')}</th>
                    <th style={{ padding: '8px 4px' }}>{t('docker.col_ports')}</th>
                  </tr>
                </thead>
                <tbody>
                  {containers.map((c, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '8px 4px', color: 'var(--text-muted)' }}>{c.image.split('@')[0]}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <span style={{
                          color: c.state === 'running' ? 'var(--green)' : 'var(--text-muted)',
                          fontSize: 10,
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}>
                          {c.state}
                        </span>
                      </td>
                      <td style={{ padding: '8px 4px', fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{c.ports}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('docker.empty')}</div>
            )}
          </div>
        </MetricCard>

        <MetricCard title={t('network.title')} titleColor="#64b5f6">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {sysInfo && (
              <>
                <div
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{t('network.primary_adapter')}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#81d4fa' }}>{sysInfo.ip ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('network.host', { hostname: sysInfo.hostname })}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(79,195,247,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('network.receive')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#4fc3f7' }}>{m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,82,82,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('network.send')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#ff8a80' }}>{m?.netTxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(0,230,118,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('network.listening_ports')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{listeningPorts}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(124,77,255,0.1)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('network.docker_networks')}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{dockerNetworks}</div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('network.active_containers', { count: runningContainers })}
                </div>
              </>
            )}
          </div>
        </MetricCard>
      </div>

      <MetricCard title={t('security.title')} subValue={t('security.subtitle')} titleColor="#ffb74d">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('security.posture')}</div>
            <div style={{
              fontSize: 12,
              fontWeight: 800,
              color: securityRiskCount === 0 ? 'var(--green)' : '#ffb74d',
              background: securityRiskCount === 0 ? 'rgba(0,230,118,0.12)' : 'rgba(255,183,77,0.14)',
              border: `1px solid ${securityRiskCount === 0 ? 'rgba(0,230,118,0.3)' : 'rgba(255,183,77,0.35)'}`,
              borderRadius: 999,
              padding: '4px 10px'
            }}>
              {securityRiskCount === 0 ? t('security.secure') : t('security.risks', { count: securityRiskCount })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <MiniStatus label={t('security.firewall')} value={security?.firewall ?? 'unknown'} ok={security?.firewall === 'active'} />
            <MiniStatus label={t('security.selinux')} value={security?.selinux ?? 'unknown'} ok={(security?.selinux ?? '').toLowerCase() === 'enforcing'} />
            <MiniStatus label={t('security.failed_auth')} value={String(security?.failedAuth24h ?? 0)} ok={(security?.failedAuth24h ?? 0) < 20} />
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <SettingsRow label={t('security.firewall_ufw')} value={security?.firewall ?? 'unknown'} />
            <SettingsRow label={t('security.selinux')} value={security?.selinux ?? 'unknown'} />
            <SettingsRow label={t('security.ssh_root_login')} value={security?.sshPermitRootLogin ?? 'unknown'} />
            <SettingsRow label={t('security.ssh_password_auth')} value={security?.sshPasswordAuth ?? 'unknown'} />
            <SettingsRow label={t('security.failed_auth')} value={String(security?.failedAuth24h ?? 0)} />
            <SettingsRow label={t('security.risky_ports')} value={(security?.riskyOpenPorts?.length ?? 0) > 0 ? security!.riskyOpenPorts.join(', ') : t('security.none')} />
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.02)', maxHeight: 180, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t('security.failed_auth_samples')}</div>
              {(securityDrilldown?.failedAuthSamples.length ?? 0) === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('security.no_failed_auth')}</div>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {securityDrilldown?.failedAuthSamples.map((line, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#ffb3b3', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.02)', maxHeight: 160, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{t('security.risky_port_owners')}</div>
              {(securityDrilldown?.riskyPortOwners.length ?? 0) === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('security.no_risky_port_owners')}</div>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
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

      {/* System + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, alignItems: 'stretch' }}>
        <MetricCard title={t('sysinfo.title')} minHeight={560} titleColor="#80deea">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>{t('sysinfo.about')}</div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>
                {sysInfo?.distro ?? '—'}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('sysinfo.hostname', { hostname: sysInfo?.hostname ?? '—' })}
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => void copySystemReport()}
                  style={{
                    border: '1px solid var(--border)',
                    background: copiedReport ? 'rgba(0,230,118,0.15)' : 'rgba(255,255,255,0.04)',
                    color: copiedReport ? 'var(--green)' : 'var(--text-main)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {copiedReport ? t('sysinfo.copied') : t('sysinfo.copy')}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <SettingsRow label={t('sysinfo.kernel')} value={sysInfo?.kernel} />
              <SettingsRow label={t('sysinfo.architecture')} value={sysInfo?.arch} />
              <SettingsRow label={t('sysinfo.packages')} value={sysInfo?.packages} />
              <SettingsRow label={t('sysinfo.shell')} value={sysInfo?.shell} />
              <SettingsRow label={t('sysinfo.desktop')} value={sysInfo?.de} />
              <SettingsRow label={t('sysinfo.session')} value={sysInfo?.wm} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>{t('sysinfo.specs')}</div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                <SettingsRow label={t('sysinfo.graphics')} value={sysInfo?.gpu} />
                <SettingsRow label={t('sysinfo.display')} value={sysInfo?.resolution} />
                <SettingsRow label={t('sysinfo.ram')} value={sysInfo?.memoryUsage} />
                <SettingsRow label={t('sysinfo.uptime')} value={m ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m` : '—'} />
              </div>
            </div>
          </div>
        </MetricCard>

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
          titleColor="#a5d6a7"
          valueColor={gitTotal !== null ? gitScoreColor(gitTotal) : 'var(--text-muted)'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
            <div className="hp-muted" style={{ fontSize: 12, lineHeight: 1.45, padding: '2px 2px 0' }}>
              {t('config.based_on')}
            </div>
            {gitCfg ? (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
                  <MonitorGitScoreTile title={t('config.identity')} score={gitIdentityScore(gitCfg)} subtitle={t('config.identity_sub')} />
                  <MonitorGitScoreTile title={t('config.security')} score={gitSecurityScore(gitCfg)} subtitle={t('config.security_sub')} />
                  <MonitorGitScoreTile title={t('config.performance')} score={gitPerformanceScore(gitCfg)} subtitle={t('config.performance_sub')} />
                  <MonitorGitScoreTile title={t('config.compatibility')} score={gitCompatibilityScore(gitCfg)} subtitle={t('config.compatibility_sub')} />
                </div>
                <Link
                  to="/git?tab=config"
                  className="hp-btn hp-btn-primary"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                    alignSelf: 'flex-start',
                  }}
                >
                  {t('config.open')}
                </Link>
              </>
            ) : null}
          </div>
        </MetricCard>
      </div>

      {/* Disk / Processes with Alerts under Disk */}
      <div id="monitor-disk" className="monitor-grid-dual" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <MetricCard title={t('disk.title')} value={`${m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps`} subValue={t('disk.subtitle')} titleColor="#80cbc4" valueColor="#80cbc4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(129,199,132,0.08)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('disk.read')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#81c784' }}>{m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,167,38,0.1)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('disk.write')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffb74d' }}>{m?.diskWriteMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
            </div>
          </MetricCard>

          <MetricCard title={t('alerts.title')} value={`${alerts.length}`} subValue={t('alerts.subtitle')} contentMarginTop={22}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length === 0 ? (
                <div style={{ color: 'var(--green)', fontWeight: 700 }}>{t('alerts.none')}</div>
              ) : alerts.map((a, i) => (
                <div key={i} style={{ border: '1px solid rgba(255,82,82,0.25)', background: 'rgba(255,82,82,0.08)', borderRadius: 8, padding: '8px 10px', color: '#ffb3b3' }}>
                  {a}
                </div>
              ))}
            </div>
          </MetricCard>
        </div>

        <div id="monitor-processes">
          <MetricCard title={t('processes.title')} subValue={t('processes.subtitle')} minHeight={378} titleColor="#ffd54f">
          <div style={{ maxHeight: 322, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 4px' }}>{t('processes.pid')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('processes.command')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('processes.cpu')}</th>
                  <th style={{ padding: '8px 4px' }}>{t('processes.mem')}</th>
                </tr>
              </thead>
              <tbody>
                {topProcesses.map((p) => (
                  <tr key={p.pid} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px' }} className="mono">{p.pid}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 600, color: '#ffe082' }}>{p.command}</td>
                    <td style={{ padding: '8px 4px', color: p.cpuPercent >= 60 ? '#ff8a80' : p.cpuPercent >= 30 ? '#ffcc80' : '#a5d6a7', fontWeight: 700 }}>{p.cpuPercent.toFixed(1)}</td>
                    <td style={{ padding: '8px 4px', color: p.memPercent >= 40 ? '#ce93d8' : '#90caf9', fontWeight: 700 }}>{p.memPercent.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </MetricCard>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ title, value, subValue, children, minHeight, contentMarginTop = 16, titleColor, valueColor }: { title: string, value?: string, subValue?: string, children?: ReactNode, minHeight?: number, contentMarginTop?: number, titleColor?: string, valueColor?: string }): ReactElement {
  return (
    <section className="monitor-metric-card" style={{ minHeight }}>
      <div className="monitor-metric-card-bar" />
      <div className="monitor-metric-title" style={{ color: titleColor }}>{title}</div>
      {value && <div className="monitor-metric-value" style={{ color: valueColor }}>{value}</div>}
      {subValue && <div className="monitor-metric-subtitle">{subValue}</div>}
      <div style={{ marginTop: contentMarginTop }}>{children}</div>
    </section>
  )
}

function ProgressBar({ pct, color }: { pct: number, color: string }): ReactElement {
  return (
    <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
    </div>
  )
}

function UsageRing({ pct, size, color }: { pct: number, size: number, color: string }): ReactElement {
  const radius = (size - 10) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
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
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
        {pct}%
      </div>
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

function SettingsRow({ label, value }: { label: string, value?: string }): ReactElement {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 42%) 1fr',
        gap: 12,
        alignItems: 'baseline',
        padding: '10px 10px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-main)', wordBreak: 'break-word' }}>{value ?? '—'}</div>
    </div>
  )
}

function MiniStatus({ label, value, ok }: { label: string; value: string; ok: boolean }): ReactElement {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: ok ? 'var(--green)' : '#ffb74d' }}>{value}</div>
    </div>
  )
}

