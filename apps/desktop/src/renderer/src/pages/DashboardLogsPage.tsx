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
  const doneJobs = jobs.filter((j) => j.state !== 'running').slice(-12)
  const allJobsDisplay = [...runningJobs, ...doneJobs]

  return (
    <div className="elevated-page logs-page">
      {/* ── Hero ── */}
      <div className="logs-hero-section">
        <div>
          <div className="logs-eyebrow">
            <span className="codicon codicon-output" />
            Dashboard · Logs
          </div>
          <h1 className="logs-title">Logs &amp; Activity</h1>
          <p className="logs-subtitle">
            Compose stack output and background job history. Jobs refresh every 2 seconds.
          </p>
        </div>
      </div>

      {/* ── Dashboard Grid ── */}
      <div className="logs-dashboard-grid">
        {/* Left Column: Compose Terminal */}
        <div className="logs-main-col">
          <div className="logs-card-container">
            <div className="logs-card-header">
              <div className="logs-card-header-title">
                <span className="codicon codicon-terminal" style={{ color: 'var(--accent)' }} />
                Compose Output
              </div>
              <div className="logs-controls">
                <span className="logs-select-label">Profile:</span>
                <div className="logs-select-wrapper">
                  <select
                    className="logs-select"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])}
                  >
                    {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <span className="codicon codicon-chevron-down logs-select-arrow" />
                </div>
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
            <pre ref={logRef} className="logs-terminal">{composeLog || 'Fetching logs...'}</pre>
          </div>
        </div>

        {/* Right Column: Job History & Progress */}
        <div className="logs-side-col">
          {/* Running Job Banners */}
          {runningJobs.length > 0 && (
            <div className="logs-active-jobs-group">
              <div className="logs-section-subtitle">Active Processes</div>
              {runningJobs.map((j) => (
                <div key={j.id} className="logs-running-banner">
                  <div className="logs-banner-top">
                    <span className="logs-pulse-dot" />
                    <span className="logs-job-name">{j.kind.replace(/_/g, ' ')}</span>
                    <span className="logs-job-pct">{j.progress}%</span>
                  </div>
                  <div className="logs-progress-track">
                    <div className="logs-progress-fill" style={{ width: `${j.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Background Jobs Card */}
          <div className="logs-card-container">
            <div className="logs-card-header">
              <div className="logs-card-header-title">
                <span className="codicon codicon-run-all" style={{ color: 'var(--accent)' }} />
                Job History
              </div>
              <span
                className="logs-status-badge"
                style={{
                  color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  background: runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.12)' : 'rgba(128, 128, 128, 0.12)',
                  border: `1px solid ${runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.35)' : 'rgba(128, 128, 128, 0.3)'}`,
                }}
              >
                {runningJobs.length > 0 ? `${runningJobs.length} active` : 'idle'}
              </span>
            </div>

            {allJobsDisplay.length === 0 ? (
              <div className="logs-empty-state">
                <span className="codicon codicon-history" style={{ fontSize: 32, color: 'var(--text-muted)' }} />
                <p className="logs-empty-title">No jobs recorded</p>
                <p className="logs-empty-desc">
                  Install a runtime or switch compose profiles to initiate tasks.
                </p>
              </div>
            ) : (
              <div className="logs-jobs-list">
                {allJobsDisplay.map((j, i) => (
                  <div
                    key={j.id}
                    className="logs-job-row"
                    style={{ borderBottom: i < allJobsDisplay.length - 1 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div className="logs-job-row-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          className="logs-job-dot"
                          style={{
                            background: stateColor(j.state),
                            boxShadow: j.state === 'running' ? `0 0 6px ${stateColor(j.state)}` : 'none',
                          }}
                        />
                        <span className="logs-job-kind">{j.kind.replace(/_/g, ' ')}</span>
                      </div>
                      <span
                        className="logs-state-pill"
                        style={{
                          color: stateColor(j.state),
                          background: stateBg(j.state),
                          border: `1px solid ${stateBorder(j.state)}`,
                        }}
                      >
                        {j.state}
                      </span>
                    </div>
                    {j.logTail.length > 0 && (
                      <div className="logs-job-tail-snippet">
                        {j.logTail[j.logTail.length - 1]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
