import type { JobSummary } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ActiveJobsStrip(): ReactElement {
  const { t } = useTranslation('nav')
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [appVersion, setAppVersion] = useState('…')
  const [engineConnected, setEngineConnected] = useState(true)

  useEffect(() => {
    window.dh
      .appInfo()
      .then((info) => {
        if (info.ok && info.version) setAppVersion(info.version)
        setEngineConnected(info.ok === true)
      })
      .catch(() => setEngineConnected(false))
    const id = setInterval(() => {
      window.dh
        .appInfo()
        .then((info) => setEngineConnected(info.ok === true))
        .catch(() => setEngineConnected(false))
    }, 10000)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(list) ? list : [])
    } catch {
      setJobs([])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 2000)
    return () => clearInterval(id)
  }, [refresh])

  async function cancelJob(jobId: string): Promise<void> {
    await window.dh.jobCancel({ id: jobId })
    await refresh()
  }

  const active = jobs.filter((j) => j.state === 'running')

  return (
    <div
      className="mono"
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        padding: '0 16px',
        background: 'rgba(0,0,0,0.3)',
        fontSize: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxSizing: 'border-box',
        height: 26,
        color: 'var(--text-muted)',
        letterSpacing: '0.02em',
      }}
    >
      {/* Left: System Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: engineConnected ? 'var(--green)' : 'var(--orange)',
              boxShadow: engineConnected ? '0 0 4px var(--green)' : '0 0 4px var(--orange)',
            }}
          />
          <span data-ltr style={{ fontWeight: 500 }}>
            {engineConnected ? t('engineConnected') : t('engineDisconnected')}
          </span>
        </div>
        <div style={{ width: 1, height: 12, background: 'var(--border)' }} />
        <span data-ltr>v{appVersion}</span>
      </div>

      {/* Right: Active Task Progress */}
      {active.length > 0 ? (
        (() => {
          const firstActive = active[0]
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--text)' }}>
                {active.length > 1 ? t('jobs.count', { count: active.length }) : ''}{' '}
                <span data-ltr>{firstActive.kind.replace(/_/g, ' ')}</span> (
                <span data-numeric>{Math.min(100, Math.max(0, firstActive.progress ?? 0))}%</span>)
              </span>
              <div
                style={{
                  width: 80,
                  height: 4,
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, firstActive.progress ?? 0))}%`,
                    height: '100%',
                    background: 'var(--accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => void cancelJob(firstActive.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--orange)',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span className="codicon codicon-close" style={{ fontSize: 10 }} />
                {t('stop')}
              </button>
            </div>
          )
        })()
      ) : (
        <span>{t('ready')}</span>
      )}
    </div>
  )
}
