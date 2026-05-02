import { ComposeProfileSchema, type JobSummary } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

const profiles = ComposeProfileSchema.options

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

  useEffect(() => {
    void loadComposeLog(profile)
  }, [profile, loadComposeLog])

  useEffect(() => {
    void refreshJobs()
    const id = setInterval(() => void refreshJobs(), 2000)
    return () => clearInterval(id)
  }, [refreshJobs])

  const stateColor = (s: string) => s === 'running' ? 'var(--accent)' : s === 'completed' ? 'var(--green)' : s === 'failed' ? 'var(--red)' : 'var(--text-muted)'
  const runningJobs = jobs.filter(j => j.state === 'running')
  const doneJobs = jobs.filter(j => j.state !== 'running').slice(-10)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100, margin: '0 auto', paddingInline: 12 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>DASHBOARD.LOGS</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Logs</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 8 }}>
          Compose stack output and background job history. Jobs refresh every 2 seconds. Compose logs load on profile select.
        </p>
      </header>

      {runningJobs.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {runningJobs.map(j => (
            <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'rgba(124,77,255,0.1)', border: '1px solid var(--accent)', borderRadius: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{j.kind.replace('_', ' ')}</span>
              <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${j.progress}%`, background: 'var(--accent)', transition: 'width 0.5s' }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{j.progress}%</span>
            </div>
          ))}
        </div>
      )}

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Compose Output</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Profile:</label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])}
              style={input}
            >
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="button" className="hp-btn" onClick={() => void loadComposeLog(profile)} disabled={composeBusy}>
              {composeBusy ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
        <pre ref={logRef} className="mono" style={pre}>{composeLog || 'Fetching…'}</pre>
      </section>

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          Background Jobs
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
            {runningJobs.length > 0 ? `${runningJobs.length} running` : 'idle'}
          </span>
        </div>
        {jobs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No jobs yet. Install a runtime or run a compose profile to see activity here.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...runningJobs, ...doneJobs].map(j => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#0f0f0f', borderRadius: 8, border: '1px solid var(--border)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(j.state), flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 12, minWidth: 140 }}>{j.kind}</span>
                <span style={{ fontSize: 12, color: stateColor(j.state), minWidth: 80 }}>{j.state}</span>
                {j.state === 'running' && (
                  <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${j.progress}%`, background: 'var(--accent)', transition: 'width 0.5s' }} />
                  </div>
                )}
                {j.logTail.length > 0 && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.logTail[j.logTail.length - 1]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

const card = { background: 'var(--bg-widget)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const input = {
  border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)',
  borderRadius: 6, padding: '6px 10px', appearance: 'none' as const, WebkitAppearance: 'none' as const,
}
const pre = {
  margin: 0, padding: 12, background: '#0a0a0a', border: '1px solid var(--border)',
  borderRadius: 8, maxHeight: 340, overflow: 'auto' as const, whiteSpace: 'pre-wrap' as const, fontSize: 12,
}
