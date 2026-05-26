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

function stateLabel(s: string): string {
  return s.toUpperCase()
}

function stateBg(s: string): string {
  if (s === 'running') return 'color-mix(in srgb, var(--accent) 12%, transparent)'
  if (s === 'completed') return 'color-mix(in srgb, var(--green) 12%, transparent)'
  if (s === 'failed') return 'color-mix(in srgb, var(--red) 12%, transparent)'
  return 'color-mix(in srgb, var(--border) 40%, transparent)'
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
    <div className="logs-page elevated-page">

      {/* ── Hero ── */}
      <header>
        <div className="logs-hero-eyebrow">Dashboard · Logs</div>
        <h1 className="logs-hero-title">Logs</h1>
        <p className="logs-hero-subtitle">
          Compose stack output and background job history. Jobs refresh every 2 seconds.
        </p>
      </header>

      {/* ── Live Job Banners ── */}
      {runningJobs.map((j) => (
        <div key={j.id} className="logs-live-banner">
          <div className="logs-live-dot" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {j.kind.replace(/_/g, ' ')}
          </span>
          <div style={{ flex: 1, height: 5, background: 'color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 3, overflow: 'hidden', maxWidth: 200 }}>
            <div style={{ height: '100%', width: `${j.progress}%`, background: 'var(--accent)', transition: 'width 0.5s ease', borderRadius: 3 }} />
          </div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
            {j.progress}%
          </span>
        </div>
      ))}

      {/* ── Compose Output ── */}
      <div className="logs-glass-panel">
        <div className="logs-panel-header">
          <div className="logs-panel-title">
            <span className="codicon codicon-output" />
            Compose Output
          </div>
          <div className="logs-panel-controls">
            <label className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profile:</label>
            <select
              className="logs-select"
              value={profile}
              onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])}
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
        <pre ref={logRef} className="logs-terminal">{composeLog || 'Fetching…'}</pre>
      </div>

      {/* ── Background Jobs ── */}
      <div className="logs-glass-panel">
        <div className="logs-panel-header">
          <div className="logs-panel-title">
            <span className="codicon codicon-run-all" />
            Background Jobs
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 10,
              background: runningJobs.length > 0
                ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                : 'color-mix(in srgb, var(--border) 40%, transparent)',
              color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              {runningJobs.length > 0 ? `${runningJobs.length} running` : 'idle'}
            </span>
          </div>
        </div>

        {allJobsDisplay.length === 0 ? (
          <div className="logs-empty-state">
            <span className="codicon codicon-run" style={{ fontSize: 32, opacity: 0.3 }} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>No jobs yet</div>
            <div style={{ fontSize: 13 }}>Install a runtime or run a compose profile to see activity here.</div>
          </div>
        ) : (
          <div className="logs-jobs-list">
            {allJobsDisplay.map((j) => (
              <div key={j.id} className="logs-job-row">
                <span
                  className="logs-job-dot"
                  style={{ background: stateColor(j.state) }}
                />
                <span className="logs-job-kind">{j.kind.replace(/_/g, ' ')}</span>
                <span
                  className="logs-job-state-badge"
                  style={{ color: stateColor(j.state), background: stateBg(j.state) }}
                >
                  {stateLabel(j.state)}
                </span>
                {j.state === 'running' && (
                  <div className="logs-job-progress">
                    <div className="logs-job-progress-fill" style={{ width: `${j.progress}%` }} />
                  </div>
                )}
                {j.logTail.length > 0 && (
                  <span className="logs-job-log-tail">
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
