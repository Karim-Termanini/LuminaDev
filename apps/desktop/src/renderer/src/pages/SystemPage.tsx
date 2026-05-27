import type { ContainerRow, HostMetricsResponse, SystemdRow } from '@linux-dev-home/shared'
import type { ReactElement, ReactNode } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function SystemPage(): ReactElement {
  const { t } = useTranslation('monitor')
  const [snap, setSnap] = useState<HostMetricsResponse | null>(null)
  const [docker, setDocker] = useState<{ ok: boolean; rows: ContainerRow[]; error?: string } | null>(null)
  const [gpu, setGpu] = useState<string>('…')

  const refresh = useCallback(async () => {
    try {
      const m = (await window.dh.metrics()) as HostMetricsResponse & { ok: boolean; error?: string }
      if (m.ok) setSnap(m)
    } catch {
      /* ignore */
    }
    try {
      const d = (await window.dh.dockerList()) as { ok: boolean; rows: ContainerRow[]; error?: string }
      setDocker(d)
    } catch {
      /* ignore */
    }
    try {
      const g = (await window.dh.hostExec({ command: 'nvidia_smi_short' })) as { ok: boolean; result: string; error?: string }
      if (g.ok) setGpu(g.result)
      else setGpu(t('system.gpuUnavailable'))
    } catch {
      setGpu(t('system.gpuUnavailable'))
    }
  }, [t])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 3000)
    return () => clearInterval(t)
  }, [refresh])

  const m = snap?.metrics
  const systemd = snap?.systemd ?? []
  const rows = docker?.ok ? docker.rows.slice(0, 6) : []
  const usedMb = m ? m.totalMemMb - m.freeMemMb : 0
  const pctMem = m && m.totalMemMb > 0 ? Math.round((usedMb / m.totalMemMb) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ margin: 0, fontSize: 24 }}>{t('system.heading')}</h1>
      <p style={{ margin: 0, color: 'var(--text-muted)', maxWidth: 900 }}>
        {t('system.description')}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('system.cpuLabel')}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
            {m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'}
          </div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
            {t('system.load')} {m?.loadAvg.map((x: number) => x.toFixed(2)).join(' / ') ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{m?.cpuModel}</div>
          <div className="mono" style={{ fontSize: 12, marginTop: 8 }}>
            {t('system.uptime')}{' '}
            {(m?.uptimeSec ?? 0) / 3600 < 48
              ? `${Math.floor((m?.uptimeSec ?? 0) / 3600)}h`
              : `${Math.floor((m?.uptimeSec ?? 0) / 86400)}d`}
          </div>
        </Card>
        <Card>
          <div className="mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {t('system.memLabel')}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>
            {m ? `${usedMb} MB` : '—'}
            <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}>
              {' '}
              / {m?.totalMemMb ?? '—'} MB
            </span>
          </div>
          <Bar pct={pctMem} color="var(--accent)" label={t('system.inUse')} />
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('system.free')} {m?.freeMemMb ?? '—'} MB
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: 'var(--text-muted)' }}>{gpu}</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Card>
          <div className="mono" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            {t('system.diskLabel')}
          </div>
          <div style={{ fontSize: 14 }}>
            {t('system.diskInfo', { free: m?.diskFreeGb ?? '—', total: m?.diskTotalGb ?? '—' })}
          </div>
        </Card>
        <Card>
          <div className="mono" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>
            {t('system.netLabel')}
          </div>
          <div className="mono" style={{ fontSize: 15 }}>
            {t('system.netInfo', { rx: m?.netRxMbps.toFixed(2) ?? '0', tx: m?.netTxMbps.toFixed(2) ?? '0' })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('system.dockerHeading')}</div>
          {!docker ? (
            <span style={{ color: 'var(--text-muted)' }}>{t('system.loading')}</span>
          ) : !docker.ok ? (
            <span style={{ color: 'var(--orange)' }}>{docker.error}</span>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>{t('system.dockerName')}</th>
                  <th>{t('system.dockerState')}</th>
                  <th>{t('system.dockerPorts')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{r.name}</td>
                    <td className="mono">{r.state}</td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {r.ports}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{t('system.systemdHeading')}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {systemd.map((s: SystemdRow) => (
              <li
                key={s.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <span className="mono">{s.name}</span>
                <span
                  style={{
                    color:
                      s.state === 'active'
                        ? 'var(--green)'
                        : s.state === 'failed'
                          ? 'var(--red)'
                          : 'var(--yellow)',
                  }}
                >
                  {s.state}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }): ReactElement {
  return (
    <section
      style={{
        background: 'var(--bg-widget)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
      }}
    >
      {children}
    </section>
  )
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }): ReactElement {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span className="mono">{pct}%</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 8,
          borderRadius: 999,
          background: '#2a2a2a',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 999,
            background: color,
          }}
        />
      </div>
    </div>
  )
}
