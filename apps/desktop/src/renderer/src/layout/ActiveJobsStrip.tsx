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
        padding: '10px 24px',
        background: 'var(--bg-panel)',
        fontSize: 12,
        maxHeight: 140,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Background jobs</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startDemo()}
          style={{
            border: '1px solid var(--border)',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            borderRadius: 4,
            padding: '4px 10px',
            fontSize: 11,
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          Run demo job
        </button>
        <span className="mono" style={{ color: 'var(--text-muted)' }}>
          Phase 0 task runner (poll + cancel)
        </span>
      </div>
      {jobs.length === 0 ? (
        <div style={{ color: 'var(--text-muted)' }}>No jobs yet.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
          {jobs.map((j) => (
            <li key={j.id} style={{ marginBottom: 6 }}>
              <span className="mono" style={{ color: 'var(--text)' }}>
                {j.kind}
              </span>{' '}
              — {j.state} ({j.progress}%)
              {j.state === 'running' ? (
                <button
                  type="button"
                  onClick={() => void cancelJob(j.id)}
                  style={{
                    marginLeft: 8,
                    border: 'none',
                    background: 'none',
                    color: 'var(--orange)',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                >
                  Cancel
                </button>
              ) : null}
              {j.logTail.length > 0 ? (
                <div className="mono" style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>
                  {j.logTail[j.logTail.length - 1]}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {active.length > 1 ? (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--orange)' }}>
          Multiple runners will merge into a single queue in later phases.
        </div>
      ) : null}
    </div>
  )
}
