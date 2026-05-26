import { ComposeProfileSchema, type JobSummary } from '@linux-dev-home/shared'
import './DashboardLogsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

const profiles = ComposeProfileSchema.options

function stateColor(s: string): string {
  if (s === 'running') return 'var(--accent)'
  if (s === 'completed') return 'var(--green)'
  if (s === 'failed') return 'var(--red)'
  return 'var(--text-muted)'
}

function stateBg(s: string): string {
  if (s === 'running') return 'rgba(124, 77, 255, 0.12)'
  if (s === 'completed') return 'rgba(0, 230, 118, 0.12)'
  if (s === 'failed') return 'rgba(248, 81, 73, 0.12)'
  return 'rgba(128, 128, 128, 0.12)'
}

function stateBorder(s: string): string {
  if (s === 'running') return 'rgba(124, 77, 255, 0.35)'
  if (s === 'completed') return 'rgba(0, 230, 118, 0.35)'
  if (s === 'failed') return 'rgba(248, 81, 73, 0.35)'
  return 'rgba(128, 128, 128, 0.3)'
}

export function DashboardLogsPage(): ReactElement {
  const [profile, setProfile] = useState<(typeof profiles)[number]>('web-dev')
  const [composeLog, setComposeLog] = useState('')
  const [composeBusy, setComposeBusy] = useState(false)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  const loadComposeLog = useCallback(async (p: (typeof profiles)[number]) => {
    setComposeBusy(true)
    try {
      const res = await window.dh.composeLogs({ profile: p })
      setComposeLog(res.ok ? res.log || '(no output yet)' : res.error || '(error fetching logs)')
      setTimeout(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }, 50)
    } finally {
      setComposeBusy(false)
    }
  }, [])

  const refreshJobs = useCallback(async () => {
    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(list) ? list : [])
    } catch { setJobs([]) }
  }, [])

  useEffect(() => { void loadComposeLog(profile) }, [profile, loadComposeLog])

  useEffect(() => {
    void refreshJobs()
    const id = setInterval(() => void refreshJobs(), 2000)
    return () => clearInterval(id)
  }, [refreshJobs])

  const runningJobs = jobs.filter((j) => j.state === 'running')
  const doneJobs = jobs.filter((j) => j.state !== 'running').slice(-10)
  const allJobsDisplay = [...runningJobs, ...doneJobs]

  return (
    <div className="logs-page">

      {/* ── Hero ── */}
      <div className="logs-hero">
        <div className="logs-eyebrow">
          <span className="codicon codicon-output" />
          Dashboard · Logs
        </div>
        <h1 className="logs-title">Logs</h1>
        <p className="logs-subtitle">
          Compose stack output and background job history. Jobs refresh every 2 seconds.
        </p>
      </div>

      {/* ── Running Job Banners ── */}
      {runningJobs.map((j) => (
        <div key={j.id} className="logs-running-banner">
          <div className="logs-pulse-dot" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {j.kind.replace(/_/g, ' ')}
          </span>
          <div className="logs-progress-track" style={{ flex: 1, maxWidth: 160 }}>
            <div className="logs-progress-fill" style={{ width: `${j.progress}%` }} />
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
            {j.progress}%
          </span>
        </div>
      ))}

      {/* ── Compose Output Card ── */}
      <div className="logs-card">
        <div className="logs-card-header">
          <div className="logs-card-title">
            <span className="codicon codicon-terminal" style={{ color: 'var(--accent)' }} />
            Compose Output
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profile:</span>
            <select
              className="logs-select"
              value={profile}
              onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])}
            >
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              type="button"
              className="logs-btn"
              onClick={() => void loadComposeLog(profile)}
              disabled={composeBusy}
            >
              <span className={`codicon ${composeBusy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
              {composeBusy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <pre ref={logRef} className="logs-terminal">{composeLog || 'Fetching…'}</pre>
      </div>

      {/* ── Background Jobs Card ── */}
      <div className="logs-card">
        <div className="logs-card-header">
          <div className="logs-card-title">
            <span className="codicon codicon-run-all" style={{ color: 'var(--accent)' }} />
            Background Jobs
            <span
              className="mono"
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 10px',
                borderRadius: 12,
                color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                background: runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.12)' : 'rgba(128, 128, 128, 0.12)',
                border: `1px solid ${runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.35)' : 'rgba(128, 128, 128, 0.3)'}`,
              }}
            >
              {runningJobs.length > 0 ? `${runningJobs.length} running` : 'idle'}
            </span>
          </div>
        </div>

        {allJobsDisplay.length === 0 ? (
          <div className="logs-empty">
            <span className="codicon codicon-history" style={{ fontSize: 34, opacity: 0.25, color: 'var(--text-muted)' }} />
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>No jobs yet</p>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Install a runtime or run a compose profile to see activity here.
            </p>
          </div>
        ) : (
          <div>
            {allJobsDisplay.map((j, i) => (
              <div
                key={j.id}
                className="logs-job-row"
                style={{ borderBottom: i < allJobsDisplay.length - 1 ? '1px solid var(--border)' : 'none' }}
              >
                <span
                  className="logs-job-dot"
                  style={{
                    background: stateColor(j.state),
                    boxShadow: j.state === 'running' ? `0 0 5px ${stateColor(j.state)}` : 'none',
                  }}
                />
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', minWidth: 150 }}>
                  {j.kind.replace(/_/g, ' ')}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    padding: '3px 10px',
                    borderRadius: 12,
                    fontFamily: 'var(--font-mono)',
                    color: stateColor(j.state),
                    background: stateBg(j.state),
                    border: `1px solid ${stateBorder(j.state)}`,
                  }}
                >
                  {j.state}
                </span>
                {j.state === 'running' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 180 }}>
                    <div className="logs-progress-track" style={{ flex: 1 }}>
                      <div className="logs-progress-fill" style={{ width: `${j.progress}%` }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {j.progress}%
                    </span>
                  </div>
                )}
                {j.logTail.length > 0 && (
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {j.logTail[j.logTail.length - 1]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
