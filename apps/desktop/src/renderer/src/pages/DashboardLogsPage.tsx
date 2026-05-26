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
  if (s === 'running') return 'color-mix(in srgb, var(--accent) 12%, transparent)'
  if (s === 'completed') return 'color-mix(in srgb, var(--green) 12%, transparent)'
  if (s === 'failed') return 'color-mix(in srgb, var(--red) 12%, transparent)'
  return 'color-mix(in srgb, var(--border) 40%, transparent)'
}

function stateBorder(s: string): string {
  if (s === 'running') return 'color-mix(in srgb, var(--accent) 35%, transparent)'
  if (s === 'completed') return 'color-mix(in srgb, var(--green) 35%, transparent)'
  if (s === 'failed') return 'color-mix(in srgb, var(--red) 35%, transparent)'
  return 'color-mix(in srgb, var(--border) 60%, transparent)'
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
    } catch {
      setJobs([])
    }
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
    <div className="elevated-page logs-page">

      {/* ── Hero ── */}
      <div className="elevated-hero">
        <div className="elevated-hero-eyebrow">
          <span className="codicon codicon-output" />
          Dashboard · Logs
        </div>
        <h1 className="elevated-hero-title">Logs</h1>
        <p className="elevated-hero-subtitle">
          Compose stack output and background job history. Jobs refresh every 2 seconds.
        </p>
      </div>

      {/* ── Running Jobs KPI Strip ── */}
      {runningJobs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {runningJobs.map((j) => (
            <div key={j.id} className="elevated-kpi-pill">
              <div className="logs-live-dot" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{j.kind.replace(/_/g, ' ')}</span>
              <div className="elevated-progress-bar" style={{ width: 80 }}>
                <div className="elevated-progress-fill" style={{ width: `${j.progress}%` }} />
              </div>
              <span className="mono elevated-kpi-value" style={{ color: 'var(--accent)' }}>
                {j.progress}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Compose Output ── */}
      <div className="elevated-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Card Header */}
        <div className="logs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <span className="codicon codicon-terminal" style={{ color: 'var(--accent)' }} />
            Compose Output
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profile:</span>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])}
              className="hp-input"
              style={{ padding: '5px 10px', fontSize: 12 }}
            >
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              type="button"
              className="hp-btn"
              onClick={() => void loadComposeLog(profile)}
              disabled={composeBusy}
            >
              <span className={`codicon ${composeBusy ? 'codicon-loading codicon-modifier-spin' : 'codicon-refresh'}`} />
              {composeBusy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        {/* Terminal Block */}
        <pre ref={logRef} className="logs-terminal">{composeLog || 'Fetching…'}</pre>
      </div>

      {/* ── Background Jobs ── */}
      <div className="elevated-card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Card Header */}
        <div className="logs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14 }}>
            <span className="codicon codicon-run-all" style={{ color: 'var(--accent)' }} />
            Background Jobs
            <span
              className="mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 10px',
                borderRadius: 12,
                background: runningJobs.length > 0
                  ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                  : 'color-mix(in srgb, var(--border) 40%, transparent)',
                color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {runningJobs.length > 0 ? `${runningJobs.length} running` : 'idle'}
            </span>
          </div>
        </div>

        {allJobsDisplay.length === 0 ? (
          <div className="logs-empty-state">
            <span className="codicon codicon-history" style={{ fontSize: 36, opacity: 0.25 }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>No jobs yet</p>
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
                style={{
                  borderBottom: i < allJobsDisplay.length - 1
                    ? '1px solid var(--border)'
                    : 'none',
                }}
              >
                {/* State Dot */}
                <span
                  className="logs-job-dot"
                  style={{
                    background: stateColor(j.state),
                    boxShadow: j.state === 'running'
                      ? `0 0 6px ${stateColor(j.state)}`
                      : 'none',
                  }}
                />

                {/* Job kind */}
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, minWidth: 160 }}>
                  {j.kind.replace(/_/g, ' ')}
                </span>

                {/* State badge */}
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

                {/* Progress bar if running */}
                {j.state === 'running' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 200 }}>
                    <div className="elevated-progress-bar" style={{ flex: 1 }}>
                      <div className="elevated-progress-fill" style={{ width: `${j.progress}%` }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {j.progress}%
                    </span>
                  </div>
                )}

                {/* Log tail */}
                {j.logTail.length > 0 && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
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
