import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

const UNITS = ['docker', 'ssh', 'nginx'] as const

export function DashboardKernelsPage(): ReactElement {
  const [gpu, setGpu] = useState('Detecting GPU…')
  const [units, setUnits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      const g = (await window.dh.hostExec({ command: 'nvidia_smi_short' })) as string
      setGpu(g || 'GPU: unavailable')
    } catch {
      setGpu('GPU: unavailable')
    }

    const nextUnits: Record<string, string> = {}
    for (const unit of UNITS) {
      try {
        const s = (await window.dh.hostExec({ command: 'systemctl_is_active', unit })) as string
        nextUnits[unit] = String(s)
      } catch {
        nextUnits[unit] = 'unknown'
      }
    }
    setUnits(nextUnits)
    setBusy(false)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 980 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          DASHBOARD.KERNELS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Kernels &amp; toolchains</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>
          Quick host checks for kernel-adjacent tooling. This page is now functional: GPU probe + service status
          snapshots.
        </p>
      </header>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void refresh()} style={btn} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh checks'}
        </button>
        <button type="button" style={btn} onClick={() => void window.dh.openExternal('https://kernel.org/')}>
          Kernel docs
        </button>
      </div>

      <section style={card}>
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>GPU</div>
        <pre className="mono" style={pre}>{gpu}</pre>
      </section>

      <section style={card}>
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>Service states</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {UNITS.map((u) => (
            <div key={u} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#141414' }}>
              <div className="mono" style={{ fontSize: 12 }}>{u}</div>
              <div style={{ marginTop: 6, color: colorFor(units[u]), fontWeight: 600 }}>{units[u] ?? '…'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function colorFor(s?: string): string {
  if (s == 'active') return 'var(--green)'
  if (s == 'failed') return 'var(--red)'
  if (s == 'inactive') return 'var(--yellow)'
  return 'var(--text-muted)'
}

const card = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 14,
}

const btn = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '9px 14px',
  cursor: 'pointer',
}

const pre = {
  margin: '10px 0 0 0',
  padding: 10,
  background: '#0a0a0a',
  border: '1px solid var(--border)',
  borderRadius: 8,
  whiteSpace: 'pre-wrap' as const,
  fontSize: 12,
}
