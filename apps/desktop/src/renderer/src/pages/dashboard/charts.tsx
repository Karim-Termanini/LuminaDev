import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export function ActivityChart(props: {
  data: Array<{ label: string; cpu: number; ram: number }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  const maxVal = 100
  return (
    <div className="dashboard-widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 className="dashboard-widget-title">{t('main.activity.title')}</h3>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: 200,
          padding: '16px 0',
          overflow: 'hidden',
        }}
      >
        {props.data.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              flex: 1,
            }}
          >
            <div style={{ display: 'flex', gap: 2, height: 140, alignItems: 'flex-end' }}>
              <div
                style={{
                  width: 8,
                  height: `${Math.max(2, (d.cpu / maxVal) * 120)}px`,
                  background: 'var(--accent)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s ease',
                }}
                title={`${t('main.activity.cpu')} ${d.cpu.toFixed(0)}%`}
              />
              <div
                style={{
                  width: 8,
                  height: `${Math.max(2, (d.ram / maxVal) * 120)}px`,
                  background: 'var(--green)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s ease',
                }}
                title={`${t('main.activity.ram')} ${d.ram.toFixed(0)}%`}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {i === 0 || i === Math.floor(props.data.length / 2) || i === props.data.length - 1
                ? d.label
                : '\u00A0'}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          marginTop: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('main.activity.cpu')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--green)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('main.activity.ram')}</span>
        </div>
      </div>
    </div>
  )
}

export function ResourceDonutChart(props: {
  data: Array<{ label: string; value: number; color: string }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  const total = props.data.reduce((sum, d) => sum + d.value, 0)
  const normalized =
    total > 0
      ? props.data.map((d) => ({ ...d, percent: (d.value / total) * 100 }))
      : props.data.map((d) => ({ ...d, percent: 0 }))

  let conic = ''
  if (total === 0) {
    conic = 'var(--border)'
  } else {
    conic = 'conic-gradient('
    let angle = 0
    normalized.forEach((d, i) => {
      const sliceAngle = (d.percent / 100) * 360
      conic += `${d.color} ${angle}deg, ${d.color} ${angle + sliceAngle}deg${i < normalized.length - 1 ? ', ' : ''}`
      angle += sliceAngle
    })
    conic += ')'
  }

  return (
    <div className="dashboard-widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 className="dashboard-widget-title">{t('main.containerStatus.title')}</h3>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
        <div
          style={{
            position: 'relative',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: conic,
            flexShrink: 0,
          }}
        >
          {/* Inner donut cutout */}
          <div
            style={{
              position: 'absolute',
              inset: 28,
              borderRadius: '50%',
              background: 'var(--bg-widget)',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 140 }}>
          {normalized.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: d.color,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {d.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {d.percent.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function EventFeed(props: {
  events: Array<{ id: string; icon: string; color: string; title: string; time: string }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">{t('main.recentActivity.title')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {props.events.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: e.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                className={`codicon codicon-${e.icon}`}
                style={{ fontSize: 14, color: '#fff' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{e.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{e.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardMetricBar(props: {
  label: string
  valueText: string
  percent: number
  subline?: string
  barColor?: string
}): ReactElement {
  const pct = Number.isFinite(props.percent) ? Math.min(100, Math.max(0, props.percent)) : 0
  const tone =
    props.barColor ?? (pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--yellow)' : 'var(--green)')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          {props.label}
        </span>
        <strong style={{ fontSize: 13, color: tone }}>{props.valueText}</strong>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 4,
          background: 'color-mix(in srgb, var(--border) 80%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            background: tone,
            transition: 'width 0.35s ease-out',
          }}
        />
      </div>
      {props.subline && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{props.subline}</span>
      )}
    </div>
  )
}
