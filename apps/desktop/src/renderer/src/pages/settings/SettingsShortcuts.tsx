import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ShortcutsSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

// eslint-disable-next-line react-refresh/only-export-components
export function buildChord(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: string }): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join('+')
}

const DEFAULT_ACTIONS: ReadonlyArray<{ key: string; label: string; defaultBinding: string }> = [
  { key: 'open_terminal', label: 'Open terminal', defaultBinding: 'Ctrl+Alt+T' },
  { key: 'toggle_sidebar', label: 'Toggle sidebar', defaultBinding: 'Ctrl+B' },
  { key: 'focus_search', label: 'Focus search', defaultBinding: 'Ctrl+K' },
  { key: 'go_dashboard', label: 'Go to Dashboard', defaultBinding: 'Alt+1' },
  { key: 'go_system', label: 'Go to Monitor', defaultBinding: 'Alt+2' },
  { key: 'go_docker', label: 'Go to Docker', defaultBinding: 'Alt+3' },
  { key: 'go_git', label: 'Go to Git', defaultBinding: 'Alt+4' },
  { key: 'go_profiles', label: 'Go to Profiles', defaultBinding: 'Alt+5' },
  { key: 'go_runtimes', label: 'Go to Runtimes', defaultBinding: 'Alt+6' },
  { key: 'go_maintenance', label: 'Go to Maintenance', defaultBinding: 'Alt+7' },
  { key: 'go_settings', label: 'Go to Settings', defaultBinding: 'Ctrl+,' },
]

export function SettingsShortcuts(): ReactElement {
  const [bindings, setBindings] = useState<ShortcutsSettings>(() =>
    Object.fromEntries(DEFAULT_ACTIONS.map((a) => [a.key, a.defaultBinding]))
  )
  const [recording, setRecording] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object' && Object.keys(res.data).length > 0) {
        setBindings((prev) => ({ ...prev, ...(res.data as ShortcutsSettings) }))
      }
    })
  }, [])

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null)
        return
      }
      const chord = buildChord(e)
      if (chord && recording) {
        setBindings((p) => ({ ...p, [recording]: chord }))
        setRecording(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      // Ensure we are sending the full current bindings object
      assertSettingsOk(await window.dh.storeSet({ key: 'shortcuts_settings', data: bindings }))
      // Dispatches a native window event that AppShell is listening for
      window.dispatchEvent(new CustomEvent('dh:shortcuts:updated'))
      setMsg('Saved. Shortcuts are active immediately.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
        Click "Record" then press a key combination. Escape cancels. Changes apply globally on save.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Binding</th>
            <th style={{ width: 80 }} />
          </tr>
        </thead>
        <tbody>
          {DEFAULT_ACTIONS.map((action) => (
            <tr key={action.key} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 12px', fontSize: 14 }}>{action.label}</td>
              <td style={{ padding: '12px 12px' }}>
                {recording === action.key ? (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' }}>Press keys… (Esc to cancel)</span>
                ) : (
                  <span className="mono" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    {bindings[action.key] ?? action.defaultBinding}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                <button type="button" className="hp-btn" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setRecording(recording === action.key ? null : action.key)}>
                  {recording === action.key ? 'Cancel' : 'Record'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy || !!recording} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save all'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
