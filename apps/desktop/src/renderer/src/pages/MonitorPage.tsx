import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import type { ContainerRow, HostMetricsResponse, HostPortRow, HostSysInfo, SshBookmark } from '@linux-dev-home/shared'

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

export function MonitorPage(): ReactElement {
  const [metrics, setMetrics] = useState<HostMetricsResponse | null>(null)
  const [ports, setPorts] = useState<HostPortRow[]>([])
  const [sysInfo, setSysInfo] = useState<HostSysInfo | null>(null)
  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(30).fill(0))
  const [netHistory, setNetHistory] = useState<{ rx: number, tx: number }[]>(new Array(30).fill({ rx: 0, tx: 0 }))
  const [githubCommits, setGithubCommits] = useState<GithubEvent[]>([])
  const [sshServers, setSshServers] = useState<SshBookmark[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])

  const refresh = useCallback(async () => {
    try {
      const m = await window.dh.metrics() as HostMetricsResponse
      setMetrics(m)
      setCpuHistory(prev => [...prev.slice(1), m.metrics.cpuUsagePercent])
      setNetHistory(prev => [...prev.slice(1), { rx: m.metrics.netRxMbps, tx: m.metrics.netTxMbps }])

      const c = await window.dh.dockerList() as { ok: boolean, rows: ContainerRow[] }
      if (c.ok) setContainers(c.rows)
    } catch (e) { console.error(e) }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        setSysInfo(await window.dh.getHostSysInfo())
        setPorts(await window.dh.getHostPorts())

        // Fetch GitHub events (mocking or using public API if possible)
        const resp = await fetch('https://api.github.com/users/Karim-Termanini/events/public')
        if (resp.ok) {
          const data = await resp.json() as GithubEvent[]
          const pushEvents = data.filter((e) => e.type === 'PushEvent').slice(0, 10)

          // Try to enrich events that have no commit messages
          const enriched = await Promise.all(pushEvents.map(async (e) => {
            if (!e.payload.commits || e.payload.commits.length === 0) {
              try {
                const cResp = await fetch(`https://api.github.com/repos/${e.repo.name}/commits?per_page=5`)
                if (cResp.ok) {
                  const cData = await cResp.json() as GithubCommitResponse[]
                  return { ...e, payload: { ...e.payload, commits: cData.map((c) => ({ message: c.commit.message })) } }
                }
              } catch { /* ignore */ }
            }
            return e
          }))
          setGithubCommits(enriched)
        }

        // Fetch SSH bookmarks
        const bookmarks = await window.dh.storeGet({ key: 'ssh_bookmarks' })
        if (bookmarks && Array.isArray(bookmarks)) {
          setSshServers(bookmarks)
        }
      } catch (e) { console.error(e) }
    })()

    const t = setInterval(refresh, 2000)
    return () => clearInterval(t)
  }, [refresh])

  const m = metrics?.metrics
  const memUsed = m ? m.totalMemMb - m.freeMemMb : 0
  const memPct = m ? Math.round((memUsed / m.totalMemMb) * 100) : 0
  const diskPct = m ? Math.round(((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Engineering Dashboard</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Real-time system health and development activity.</p>
      </header>

      {/* Primary Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <MetricCard title="CPU LOAD" value={m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'} subValue={m?.cpuModel}>
          <LiveLineChart data={cpuHistory} color="var(--accent)" height={60} />
        </MetricCard>

        <MetricCard title="MEMORY USAGE" value={m ? `${(memUsed / 1024).toFixed(1)} GB` : '—'} subValue={`Total ${((m?.totalMemMb ?? 0) / 1024).toFixed(1)} GB`}>
          <ProgressBar pct={memPct} color="#00e676" />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, opacity: 0.6 }} className="mono">
            <span>Used: {memUsed}MB</span>
            <span>Free: {m?.freeMemMb}MB</span>
          </div>
        </MetricCard>

        <MetricCard title="STORAGE" value={m ? `${(m.diskTotalGb - m.diskFreeGb).toFixed(1)} GB` : '—'} subValue={`Root Partition: ${m?.diskTotalGb} GB`}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <UsageRing pct={diskPct} size={80} color="var(--orange)" />
          </div>
        </MetricCard>
      </div>

      {/* Network & System Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <MetricCard title="NETWORK ACTIVITY" value={`${m?.netRxMbps.toFixed(2) ?? 0} Mbps`} subValue="Downlink / Uplink Traffic">
          <NetworkChart data={netHistory} height={120} />
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--accent)' }} />
              <span style={{ fontSize: 12 }}>RX: {m?.netRxMbps.toFixed(2)} Mbps</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: '#ff1744' }} />
              <span style={{ fontSize: 12 }}>TX: {m?.netTxMbps.toFixed(2)} Mbps</span>
            </div>
          </div>
        </MetricCard>

        <MetricCard title="SYSTEM INFORMATION">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>DISTRO</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{sysInfo?.distro || 'Fedora Linux'}</span>
            </div>
            <div style={{ paddingLeft: 112, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.8 }}>
              <InfoLine label="Kernel" value={sysInfo?.kernel} />
              <InfoLine label="Packages" value={sysInfo?.packages} />
              <InfoLine label="Shell" value={sysInfo?.shell} />
              <InfoLine label="DE/WM" value={`${sysInfo?.de} / ${sysInfo?.wm}`} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 12, alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>HARDWARE</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{sysInfo?.gpu || 'Intel UHD Graphics'}</span>
            </div>
            <div style={{ paddingLeft: 112, display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.8 }}>
              <InfoLine label="Res" value={sysInfo?.resolution} />
              <InfoLine label="Memory" value={sysInfo?.memoryUsage} />
              <InfoLine label="Uptime" value={m ? `${Math.floor(m.uptimeSec / 3600)}h ${Math.floor((m.uptimeSec % 3600) / 60)}m` : '—'} />
            </div>
          </div>
        </MetricCard>
      </div>

      {/* Engineering Hub Row - 3 Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 20 }}>
        <MetricCard title="ACTIVE PORTS (LISTEN)">
          <div style={{ maxHeight: 300, overflow: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '8px 4px' }}>PROTO</th>
                  <th style={{ padding: '8px 4px' }}>PORT</th>
                  <th style={{ padding: '8px 4px' }}>STATE</th>
                </tr>
              </thead>
              <tbody>
                {ports.slice(0, 15).map((p, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 4px' }} className="mono">{p.protocol.toUpperCase()}</td>
                    <td style={{ padding: '8px 4px', fontWeight: 600 }}>{p.port}</td>
                    <td style={{ padding: '8px 4px', color: 'var(--green)' }}>{p.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MetricCard>

        <MetricCard title="DOCKER CONTAINERS">
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

        <MetricCard title="NETWORK HOSTS / INTERFACES">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            {sysInfo && (
              <>
                <InfoRow label="LAN IP" value={sysInfo.ip ?? '—'} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 4, lineHeight: 1.5 }}>
                  <code style={{ color: 'var(--accent)' }}>$ ip addr show | grep inet</code>
                  <div style={{ marginTop: 8 }}>
                    Monitoring active network interfaces and bridge status for containers.
                  </div>
                </div>
              </>
            )}
          </div>
        </MetricCard>
      </div>

      {/* Activity & Servers Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <MetricCard title="GITHUB RECENT ACTIVITY">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 10 }}>
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

        <MetricCard title="REMOTE SERVERS">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {sshServers.length > 0 ? sshServers.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.user}@{s.host}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                  <span style={{ fontSize: 11, color: 'var(--green)' }}>Online</span>
                </div>
              </div>
            )) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>No remote servers saved yet.</div>
                <button
                  onClick={() => window.location.hash = '#/ssh'}
                  style={{
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Add SSH Server
                </button>
              </div>
            )}
          </div>
        </MetricCard>
      </div>
    </div>
  )
}

function MetricCard({ title, value, subValue, children }: { title: string, value?: string, subValue?: string, children?: ReactNode }): ReactElement {
  return (
    <section style={{
      background: 'var(--bg-widget)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: 20,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: 'linear-gradient(90deg, var(--accent), transparent)' }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 12 }}>{title}</div>
      {value && <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>{value}</div>}
      {subValue && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subValue}</div>}
      <div style={{ marginTop: 16 }}>{children}</div>
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

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={rxPoints} />
      <polyline fill="none" stroke="#ff1744" strokeWidth="2" points={txPoints} strokeDasharray="4 2" />
    </svg>
  )
}

function InfoLine({ label, value }: { label: string, value?: string }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-muted)', width: 70 }}>│ ├ {label}</span>
      <span style={{ fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string, value?: string }): ReactElement {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600 }}>{value ?? '—'}</span>
    </div>
  )
}
