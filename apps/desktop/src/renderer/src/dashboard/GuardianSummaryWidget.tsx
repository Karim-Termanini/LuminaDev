import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HostMetricsResponse, HostSecuritySnapshot, ContainerRow } from '@linux-dev-home/shared'

export function GuardianSummaryWidget(): ReactElement {
  const [score, setScore] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const m = await window.dh.metrics() as HostMetricsResponse
        const s = await window.dh.monitorSecurity() as HostSecuritySnapshot
        await window.dh.dockerList() as { ok: boolean, rows: ContainerRow[] }
        
        // Simple score calculation logic (mirroring MaintenancePage)
        let sCore = 100
        if (m.metrics.cpuUsagePercent > 80) sCore -= 15
        const memPct = Math.round(((m.metrics.totalMemMb - m.metrics.freeMemMb) / m.metrics.totalMemMb) * 100)
        if (memPct > 90) sCore -= 20
        if (s.firewall !== 'active') sCore -= 20
        
        setScore(Math.max(0, sCore))
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
    void fetchData()
    const id = setInterval(() => void fetchData(), 10000)
    return () => clearInterval(id)
  }, [])

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analyzing system...</div>

  const color = score !== null && score >= 90 ? 'var(--green)' : score !== null && score >= 70 ? 'var(--accent)' : 'var(--orange)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ 
          width: 12, height: 12, borderRadius: 99, background: color,
          boxShadow: `0 0 10px ${color}55`
        }} />
        <span style={{ fontSize: 16, fontWeight: 800, color }}>
          {score !== null ? `${score}% Health` : 'Offline'}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        {score !== null && score >= 90 ? 'System is in optimal condition.' : 'Maintenance recommended.'}
      </p>
      <Link to="/maintenance" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', marginTop: 4 }}>
        Open Guardian Panel →
      </Link>
    </div>
  )
}
