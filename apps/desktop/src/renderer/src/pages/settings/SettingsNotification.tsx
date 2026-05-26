import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { NotificationSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: NotificationSettings = { globalMute: false, minSeverity: 'info', osNotifications: false }

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): ReactElement {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked) }}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        position: 'relative', transition: 'background 0.2s', background: checked ? 'var(--accent)' : 'var(--border)' }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  )
}

export function SettingsNotification(): ReactElement {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'notification_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<NotificationSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'notification_settings', data: { ...settings, osNotifications: false } }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.25)', borderRadius: 6, fontSize: 12, color: 'var(--yellow, #ffc107)', marginBottom: 8 }}>
        <span className="codicon codicon-beaker" />
        Notification filters are saved but not yet wired to the toast system — coming in a future release.
      </div>
      {[
        { key: 'globalMute' as const, label: 'Global mute', description: 'Suppress all in-app toast notifications.' },
      ].map((row) => (
        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{row.label}</div>
            <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{row.description}</p>
          </div>
          <Toggle checked={!!settings[row.key]} onChange={(v) => setSettings((p) => ({ ...p, [row.key]: v }))} />
        </div>
      ))}
      <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Minimum severity</label>
        <select value={settings.minSeverity} onChange={(e) => setSettings((p) => ({ ...p, minSeverity: e.target.value as NotificationSettings['minSeverity'] }))}
          className="hp-input" style={{ fontSize: 13 }}>
          <option value="info">Info and above (all notifications)</option>
          <option value="warn">Warnings and above</option>
          <option value="error">Errors only</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>OS native notifications</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Requires Tauri notification plugin (Phase 10).
          </p>
        </div>
        <Toggle checked={false} onChange={() => {}} disabled />
      </div>
      <div style={{ paddingTop: 16 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
