import { ComposeProfileSchema, type ComposeProfile } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useState } from 'react'

const profiles = ComposeProfileSchema.options

export function WorkstationPage(): ReactElement {
  const [log, setLog] = useState<string>('')

  async function showLogs(profile: ComposeProfile): Promise<void> {
    const text = (await window.dh.composeLogs({ profile })) as string
    setLog(text)
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ marginTop: 0 }}>Workstation</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Inspect bundled compose stacks. Use the dashboard cards to run docker compose up, then fetch
        logs here for troubleshooting.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        {profiles.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => void showLogs(p)}
            className="hp-btn"
          >
            Logs: {p}
          </button>
        ))}
      </div>
      {log ? (
        <pre
          className="mono"
          style={{
            marginTop: 20,
            padding: 16,
            background: '#0a0a0a',
            border: '1px solid var(--border)',
            borderRadius: 12,
            maxHeight: 480,
            overflow: 'auto',
            fontSize: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          {log}
        </pre>
      ) : null}
    </div>
  )
}
