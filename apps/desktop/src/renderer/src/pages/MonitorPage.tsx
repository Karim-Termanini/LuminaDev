import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { ContainerRow, HostMetricsResponse, HostPortRow, HostSecurityDrilldown, HostSecuritySnapshot, HostSysInfo, TopProcessRow } from '@linux-dev-home/shared'
import { humanizeDashboardError } from './dashboardError'
import { assertMonitorOk } from './monitorContract'

type GithubEvent = {
  type: string
  created_at: string
  repo: { name: string }
  payload: {
    commits?: Array<{ message: string }>
  }
}

type GithubCommitResponse = {
  commit: {
    message: string
  }
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
  const [metrics, setMetrics] = useState<HostMetricsResponse | null>(null)
  const [ports, setPorts] = useState<HostPortRow[]>([])
  const [sysInfo, setSysInfo] = useState<HostSysInfo | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(30).fill(0))
  const [netHistory, setNetHistory] = useState<{ rx: number, tx: number }[]>(new Array(30).fill({ rx: 0, tx: 0 }))
  const [githubCommits, setGithubCommits] = useState<GithubEvent[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [topProcesses, setTopProcesses] = useState<TopProcessRow[]>([])
  const [security, setSecurity] = useState<HostSecuritySnapshot | null>(null)
  const [securityDrilldown, setSecurityDrilldown] = useState<HostSecurityDrilldown | null>(null)
  const [copiedReport, setCopiedReport] = useState(false)
  const [activeTab, setActiveTab] = useState<MonitorTabId>('overview')
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
      setMonitorError(null)
    } catch (e) {
      setMonitorError(humanizeDashboardError(e))
    }
  }, [])

  const refreshGithub = useCallback(async () => {
    try {
      const resp = await fetch('https://api.github.com/users/Karim-Termanini/events/public')
      if (!resp.ok) return
      const data = await resp.json() as GithubEvent[]
      const pushEvents = data.filter((e) => e.type === 'PushEvent').slice(0, 10)
      const enriched = await Promise.all(pushEvents.map(async (e) => {
        if (!e.payload.commits || e.payload.commits.length === 0) {
          try {
            const cResp = await fetch(`https://api.github.com/repos/${e.repo.name}/commits?per_page=5`)
            if (cResp.ok) {
              const cData = await cResp.json() as GithubCommitResponse[]
              return { ...e, payload: { ...e.payload, commits: cData.map((c) => ({ message: c.commit.message })) } }
            }
          } catch {
            /* ignore */
          }
        }
        return e
      }))
      setGithubCommits(enriched)
    } catch {
      /* ignore transient network errors */
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refreshStatic()
        await refreshLive()
        await refreshGithub()

      } catch (e) { console.error(e) }
    })()

    const fast = setInterval(() => { void refreshLive() }, 2000)
    const slow = setInterval(() => { void refreshStatic() }, 10000)
    const gh = setInterval(() => { void refreshGithub() }, 30000)
    return () => {
      clearInterval(fast)
      clearInterval(slow)
      clearInterval(gh)
    }
  }, [refreshLive, refreshStatic, refreshGithub])

  const m = metrics?.metrics
  const memUsed = m ? m.totalMemMb - m.freeMemMb : 0
  const memPct = m ? Math.round((memUsed / m.totalMemMb) * 100) : 0
  const swapUsed = m ? Math.max(0, m.swapTotalMb - m.swapFreeMb) : 0
  const swapPct = m && m.swapTotalMb > 0 ? Math.round((swapUsed / m.swapTotalMb) * 100) : 0
  const diskPct = m ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : 0
  const listeningPorts = ports.filter((p) => p.state.toLowerCase().includes('listen')).length
  const runningContainers = containers.filter((c) => c.state === 'running').length
  const dockerNetworks = new Set(containers.flatMap((c) => c.networks ?? [])).size
  const alerts: string[] = []
  if (m && m.cpuUsagePercent >= 85) alerts.push(`High CPU usage: ${m.cpuUsagePercent.toFixed(1)}%`)
  if (memPct >= 90) alerts.push(`High RAM usage: ${memPct}%`)
  if (swapPct >= 80 && (m?.swapTotalMb ?? 0) > 0) alerts.push(`High swap usage: ${swapPct}%`)
  if ((security?.riskyOpenPorts?.length ?? 0) > 0) alerts.push(`Risky open ports: ${security?.riskyOpenPorts?.join(', ')}`)
  if ((security?.failedAuth24h ?? 0) > 20) alerts.push(`Elevated failed SSH auth attempts (24h): ${security?.failedAuth24h}`)
  const securityRiskCount =
    (security?.firewall === 'inactive' ? 1 : 0) +
    (security?.sshPermitRootLogin === 'yes' ? 1 : 0) +
    (security?.sshPasswordAuth === 'yes' ? 1 : 0) +
    ((security?.riskyOpenPorts.length ?? 0) > 0 ? 1 : 0) +
    ((security?.failedAuth24h ?? 0) > 20 ? 1 : 0)
  const copySystemReport = async () => {
    const report = [
      `Distro: ${sysInfo?.distro ?? '—'}`,
      `Hostname: ${sysInfo?.hostname ?? '—'}`,
      `Kernel: ${sysInfo?.kernel ?? '—'}`,
      `Architecture: ${sysInfo?.arch ?? '—'}`,
      `Packages: ${sysInfo?.packages ?? '—'}`,
      `Shell: ${sysInfo?.shell ?? '—'}`,
      `Desktop: ${sysInfo?.de ?? '—'} / ${sysInfo?.wm ?? '—'}`,
      `Graphics: ${sysInfo?.gpu ?? '—'}`,
      `Display: ${sysInfo?.resolution ?? '—'}`,
      `Memory: ${sysInfo?.memoryUsage ?? '—'}`,
      `Swap: ${m ? `${(swapUsed / 1024).toFixed(1)} / ${(m.swapTotalMb / 1024).toFixed(1)} GB` : '—'}`,
      `Uptime: ${m ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m` : '—'}`,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Engineering Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Real-time system health and development activity.</p>
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
            {tab.label}
          </button>
        ))}
      </div>

      {/* Primary Metrics Row */}
      <div id="monitor-overview" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <MetricCard title="CPU LOAD" value={m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'} subValue={m?.cpuModel}>
          <LiveLineChart data={cpuHistory} color="var(--accent)" height={60} />
        </MetricCard>

        <MetricCard title="MEMORY USAGE" value={m ? `${(memUsed / 1024).toFixed(1)} GB` : '—'} subValue={`RAM total ${((m?.totalMemMb ?? 0) / 1024).toFixed(1)} GB`}>
          <ProgressBar pct={memPct} color="#00e676" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.6 }} className="mono">
            <span>Used: {memUsed}MB</span>
            <span>Free: {m?.freeMemMb}MB</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>SWAP</div>
          <ProgressBar pct={swapPct} color="#42a5f5" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.6 }} className="mono">
            <span>Used: {swapUsed}MB</span>
            <span>Total: {m?.swapTotalMb ?? 0}MB</span>
          </div>
        </MetricCard>

        <MetricCard title="STORAGE" value={m ? `${(m.diskTotalGb - m.diskFreeGb).toFixed(1)} GB` : '—'} subValue={`Root partition: ${m?.diskTotalGb} GB`}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <UsageRing pct={diskPct} size={80} color="var(--orange)" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
            <span>Used {(m ? (m.diskTotalGb - m.diskFreeGb).toFixed(1) : '0')} GB</span>
            <span>Free {m?.diskFreeGb ?? 0} GB</span>
          </div>
        </MetricCard>
      </div>

      {/* Network Activity */}
      <div id="monitor-network" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }}>
        <MetricCard title="NETWORK ACTIVITY" value={`${m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps`} subValue="Downlink / Uplink traffic">
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'rgba(255,255,255,0.02)', padding: 10 }}>
            <NetworkChart data={netHistory} height={120} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent)' }} />
              <span style={{ fontSize: 12 }}>RX: {m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ff1744' }} />
              <span style={{ fontSize: 12 }}>TX: {m?.netTxMbps.toFixed(2) ?? '0.00'} Mbps</span>
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Engineering Hub Row - 2 Columns */}
      <div id="monitor-docker" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20 }}>
        <MetricCard title="ACTIVE PORTS (LISTEN)" value={`${listeningPorts}`} subValue="Open listening sockets" titleColor="#66bb6a" valueColor="#81c784">
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
              Listening sockets refresh automatically (about every 10 seconds).
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 4px' }}>PROTO</th>
                  <th style={{ padding: '8px 4px' }}>PORT</th>
                  <th style={{ padding: '8px 4px' }}>STATE</th>
                </tr>
              </thead>
              <tbody>
                {ports.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ padding: '12px 4px', color: 'var(--text-muted)' }}>
                      No listening ports detected (or `ss`/`netstat` is unavailable in this environment).
                    </td>
                  </tr>
                ) : (
                  ports.slice(0, 25).map((p, i) => {
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
                  </tr>
                  )
                  })
                )}
              </tbody>
            </table>
          </div>
        </MetricCard>

        <MetricCard title="DOCKER CONTAINERS" value={`${runningContainers}`} subValue={`Running / Total ${containers.length}`}>
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
            {containers.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 4px' }}>NAME</th>
                    <th style={{ padding: '8px 4px' }}>IMAGE</th>
                    <th style={{ padding: '8px 4px' }}>STATUS</th>
                    <th style={{ padding: '8px 4px' }}>PORTS</th>
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
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No containers found.</div>
            )}
          </div>
        </MetricCard>

        <MetricCard title="NETWORK HOSTS / INTERFACES" titleColor="#64b5f6">
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
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>PRIMARY ADAPTER</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#81d4fa' }}>{sysInfo.ip ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Host: <span className="mono">{sysInfo.hostname}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(79,195,247,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>RECEIVE</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#4fc3f7' }}>{m?.netRxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,82,82,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SEND</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#ff8a80' }}>{m?.netTxMbps.toFixed(2) ?? '0.00'} Mbps</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(0,230,118,0.08)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>LISTENING PORTS</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{listeningPorts}</div>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(124,77,255,0.1)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>DOCKER NETWORKS</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{dockerNetworks}</div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Active containers: <strong style={{ color: 'var(--text-main)' }}>{runningContainers}</strong>
                </div>
              </>
            )}
          </div>
        </MetricCard>
      </div>

      <MetricCard title="SECURITY OVERVIEW" subValue="Host hardening and exposure" titleColor="#ffb74d">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current security posture</div>
            <div style={{
              fontSize: 12,
              fontWeight: 800,
              color: securityRiskCount === 0 ? 'var(--green)' : '#ffb74d',
              background: securityRiskCount === 0 ? 'rgba(0,230,118,0.12)' : 'rgba(255,183,77,0.14)',
              border: `1px solid ${securityRiskCount === 0 ? 'rgba(0,230,118,0.3)' : 'rgba(255,183,77,0.35)'}`,
              borderRadius: 999,
              padding: '4px 10px'
            }}>
              {securityRiskCount === 0 ? 'Secure baseline' : `${securityRiskCount} risk${securityRiskCount > 1 ? 's' : ''}`}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <MiniStatus label="Firewall" value={security?.firewall ?? 'unknown'} ok={security?.firewall === 'active'} />
            <MiniStatus label="SELinux" value={security?.selinux ?? 'unknown'} ok={(security?.selinux ?? '').toLowerCase() === 'enforcing'} />
            <MiniStatus label="Failed auth (24h)" value={String(security?.failedAuth24h ?? 0)} ok={(security?.failedAuth24h ?? 0) < 20} />
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <SettingsRow label="Firewall (ufw)" value={security?.firewall ?? 'unknown'} />
            <SettingsRow label="SELinux" value={security?.selinux ?? 'unknown'} />
            <SettingsRow label="SSH root login" value={security?.sshPermitRootLogin ?? 'unknown'} />
            <SettingsRow label="SSH password auth" value={security?.sshPasswordAuth ?? 'unknown'} />
            <SettingsRow label="Failed auth (24h)" value={String(security?.failedAuth24h ?? 0)} />
            <SettingsRow label="Risky open ports" value={(security?.riskyOpenPorts.length ?? 0) > 0 ? security!.riskyOpenPorts.join(', ') : 'none'} />
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.02)', maxHeight: 180, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>FAILED AUTH SAMPLES (24H)</div>
              {(securityDrilldown?.failedAuthSamples.length ?? 0) === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No failed auth lines found.</div>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {securityDrilldown?.failedAuthSamples.map((line, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#ffb3b3', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,255,255,0.02)', maxHeight: 160, overflow: 'auto' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>RISKY PORT OWNERS</div>
              {(securityDrilldown?.riskyPortOwners.length ?? 0) === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No risky port ownership detected.</div>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {securityDrilldown?.riskyPortOwners.map((p, i) => (
                    <div key={i} style={{ fontSize: 12 }}>
                      Port <strong>{p.port}</strong> {'->'} {p.process}{p.pid ? ` (pid ${p.pid})` : ''}
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
        <MetricCard title="SYSTEM INFORMATION" minHeight={560} titleColor="#80deea">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>ABOUT THIS PC</div>
              <div style={{ marginTop: 8, fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>
                {sysInfo?.distro ?? '—'}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                Hostname: <span className="mono" style={{ color: 'var(--text-main)' }}>{sysInfo?.hostname ?? '—'}</span>
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
                  {copiedReport ? 'Copied' : 'Copy system report'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              <SettingsRow label="Kernel" value={sysInfo?.kernel} />
              <SettingsRow label="Architecture" value={sysInfo?.arch} />
              <SettingsRow label="Packages" value={sysInfo?.packages} />
              <SettingsRow label="Default shell" value={sysInfo?.shell} />
              <SettingsRow label="Desktop environment" value={sysInfo?.de} />
              <SettingsRow label="Session" value={sysInfo?.wm} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.06em' }}>DEVICE SPECIFICATIONS</div>
              <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                <SettingsRow label="Graphics" value={sysInfo?.gpu} />
                <SettingsRow label="Display resolution" value={sysInfo?.resolution} />
                <SettingsRow label="Installed RAM" value={sysInfo?.memoryUsage} />
                <SettingsRow label="Uptime" value={m ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m` : '—'} />
              </div>
            </div>
          </div>
        </MetricCard>

        <MetricCard title="GITHUB RECENT ACTIVITY" subValue="Live feed with periodic refresh" minHeight={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10, maxHeight: 500, overflow: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Auto-refresh every 30 seconds.
            </div>
            {githubCommits.length > 0 ? githubCommits.map((e, i) => (
              <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>{e.repo.name.split('/')[1]}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {e.payload.commits && e.payload.commits.length > 0 ? e.payload.commits.slice(0, 5).map((c, ci) => (
                    <div key={ci} style={{ fontSize: 12, display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 900 }}>├─</span>
                      <span style={{ color: 'var(--text-main)', lineHeight: 1.4, fontWeight: 500 }}>{c.message}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                      <span style={{ color: 'var(--text-muted)' }}>└─</span>
                      <span>No detailed commit info in public feed.</span>
                    </div>
                  )}
                </div>
              </div>
            )) : <div style={{ color: 'var(--text-muted)' }}>No recent activity found.</div>}
          </div>
        </MetricCard>
      </div>

      {/* Disk / Processes with Alerts under Disk */}
      <div id="monitor-disk" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20 }}>
          <MetricCard title="DISK I/O LIVE" value={`${m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps`} subValue="Read / Write throughput" titleColor="#80cbc4" valueColor="#80cbc4">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(129,199,132,0.08)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>READ</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#81c784' }}>{m?.diskReadMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'rgba(255,167,38,0.1)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>WRITE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#ffb74d' }}>{m?.diskWriteMbps.toFixed(2) ?? '0.00'} Mbps</div>
              </div>
            </div>
          </MetricCard>

          <MetricCard title="ALERTS THRESHOLDS" value={`${alerts.length}`} subValue="Triggered now" contentMarginTop={22}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.length === 0 ? (
                <div style={{ color: 'var(--green)', fontWeight: 700 }}>No active alerts.</div>
              ) : alerts.map((a, i) => (
                <div key={i} style={{ border: '1px solid rgba(255,82,82,0.25)', background: 'rgba(255,82,82,0.08)', borderRadius: 8, padding: '8px 10px', color: '#ffb3b3' }}>
                  {a}
                </div>
              ))}
            </div>
          </MetricCard>
        </div>

        <div id="monitor-processes">
          <MetricCard title="TOP PROCESSES" subValue="Highest CPU consumers" minHeight={378} titleColor="#ffd54f">
          <div style={{ maxHeight: 322, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 4px' }}>PID</th>
                  <th style={{ padding: '8px 4px' }}>COMMAND</th>
                  <th style={{ padding: '8px 4px' }}>CPU%</th>
                  <th style={{ padding: '8px 4px' }}>MEM%</th>
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
    <section style={{
      background: 'var(--bg-widget)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      minHeight,
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: titleColor ?? 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 12 }}>{title}</div>
      {value && <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: valueColor ?? 'var(--text-main)' }}>{value}</div>}
      {subValue && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subValue}</div>}
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

