import { ComposeProfileSchema, type JobSummary } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

const profiles = ComposeProfileSchema.options

export function DashboardLogsPage(): ReactElement {
  const [profile, setProfile] = useState<(typeof profiles)[number]>('web-dev')
  const [composeLog, setComposeLog] = useState('')
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [busy, setBusy] = useState(false)

  async function refreshJobs(): Promise<void> {
    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(list) ? list : [])
    } catch {
      setJobs([])
    }
  }

  async function loadComposeLog(): Promise<void> {
    setBusy(true)
    try {
      const text = (await window.dh.composeLogs({ profile })) as string
      setComposeLog(text || 'No output yet.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refreshJobs()
    const id = setInterval(() => void refreshJobs(), 2000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          DASHBOARD.LOGS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Logs</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>
          Unified logs page for compose output and background tasks.
        </p>
      </header>

      <section style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="mono" style={{ fontSize: 12 }}>Compose profile</label>
          <select value={profile} onChange={(e) => setProfile(e.target.value as (typeof profiles)[number])} style={input}>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button type="button" style={btn} onClick={() => void loadComposeLog()} disabled={busy}>
            {busy ? 'Loading…' : 'Fetch compose logs'}
          </button>
        </div>
        <pre className="mono" style={pre}>
          {composeLog || 'Press "Fetch compose logs" to load output.'}
        </pre>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Background jobs</div>
          <button type="button" style={btnSmall} onClick={() => void refreshJobs()}>Refresh</button>
        </div>
        {jobs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', marginTop: 10 }}>No jobs reported yet.</div>
        ) : (
          <ul style={{ margin: '10px 0 0 0', paddingLeft: 18 }}>
            {jobs.map((j) => (
              <li key={j.id} style={{ marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--text)' }}>{j.kind}</span> — {j.state} ({j.progress}%)
                {j.logTail.length > 0 ? (
                  <div className="mono" style={{ fontSize: 11, opacity: 0.85 }}>{j.logTail[j.logTail.length - 1]}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

const card = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 14,
}

const input = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '7px 10px',
}

const btn = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const btnSmall = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 12,
}

const pre = {
  margin: '12px 0 0 0',
  padding: 12,
  background: '#0a0a0a',
  border: '1px solid var(--border)',
  borderRadius: 8,
  maxHeight: 420,
  overflow: 'auto' as const,
  whiteSpace: 'pre-wrap' as const,
  fontSize: 12,
}
