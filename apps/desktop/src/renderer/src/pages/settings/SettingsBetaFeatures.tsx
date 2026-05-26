import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { BetaFeaturesState } from '@linux-dev-home/shared'

const FLAGS: ReadonlyArray<{ key: string; label: string; description: string }> = [
  { key: 'enable_experimental_terminal_multiplexer', label: 'Terminal multiplexer', description: 'Experimental xterm.js multi-pane terminal (unstable).' },
  { key: 'enable_ai_commit_suggestions', label: 'AI commit suggestions', description: 'Suggest commit messages using AI (requires API key in environment).' },
  { key: 'enable_profile_auto_switch', label: 'Profile auto-switch', description: 'Auto-switch active profile when changing project directory.' },
]

export function SettingsBetaFeatures(): ReactElement {
  const [state, setState] = useState<BetaFeaturesState>({})

  useEffect(() => {
    void window.dh.storeGet({ key: 'beta_features_state' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setState(res.data as BetaFeaturesState)
      }
    })
  }, [])

  async function toggle(key: string, enabled: boolean): Promise<void> {
    const next = { ...state, [key]: enabled }
    setState(next)
    await window.dh.storeSet({ key: 'beta_features_state', data: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.25)', borderRadius: 6, fontSize: 12, color: 'var(--yellow, #ffc107)', marginBottom: 8 }}>
        <span className="codicon codicon-beaker" />
        These flags are saved but not yet read at runtime — coming in a future release.
      </div>
      <p className="hp-muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        Experimental flags. May be unstable or incomplete. Saved immediately on toggle.
      </p>
      {FLAGS.map((flag, i) => (
        <div key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0',
          borderTop: i === 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{flag.label}</div>
            <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{flag.description}</p>
          </div>
          <button type="button" role="switch" aria-checked={!!state[flag.key]}
            onClick={() => { void toggle(flag.key, !state[flag.key]) }}
            style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              background: state[flag.key] ? 'var(--accent)' : 'var(--border)' }}>
            <span style={{ position: 'absolute', top: 3, left: state[flag.key] ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </div>
      ))}
    </div>
  )
}
