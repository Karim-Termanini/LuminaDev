import type { JobSummary } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'

export function ActiveJobsStrip(): ReactElement {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [busy, setBusy] = useState(false)

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

  async function startDemo(): Promise<void> {
    setBusy(true)
    try {
      await window.dh.jobStart({ kind: 'demo_countdown', durationMs: 5000 })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    await window.dh.jobCancel({ id: jobId })
    await refresh()
  }

  const active = jobs.filter((j) => j.state === 'running')

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        padding: '8px 24px',
        background: 'var(--bg-panel)',
        fontSize: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxSizing: 'border-box',
        height: 38,
      }}
    >
      {/* Left: System Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }} />
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>System Status: Nominal</span>
      </div>

      {/* Right: Active Task Progress */}
      {active.length > 0 ? (
        (() => {
          const firstActive = active[0]
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text)' }}>
                Running task: {firstActive.kind.replace(/_/g, ' ')} ({firstActive.progress}%)
              </span>
              <div style={{ width: 120, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${firstActive.progress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }} />
              </div>
              <button
                type="button"
                onClick={() => void cancelJob(firstActive.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: 'var(--orange)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span className="codicon codicon-close" style={{ fontSize: 11 }} />
                Cancel
              </button>
            </div>
          )
        })()
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No active tasks</span>
      )}
    </div>
  )
}
