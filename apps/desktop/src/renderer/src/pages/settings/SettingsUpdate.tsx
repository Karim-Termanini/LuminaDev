import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

type UpdateSettings = { releaseChannel: string; checkOnStartup: boolean; lastChecked?: number }
const DEFAULTS: UpdateSettings = { releaseChannel: 'stable', checkOnStartup: true }

export function SettingsUpdate(): ReactElement {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULTS)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'update_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings(res.data as UpdateSettings)
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const data = { releaseChannel: settings.releaseChannel as 'stable' | 'alpha', checkOnStartup: settings.checkOnStartup, lastChecked: Date.now() }
      assertSettingsOk(await window.dh.storeSet({ key: 'update_settings', data }))
      setSettings(data)
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Release channel</div>
        <select value={settings.releaseChannel} onChange={(e) => setSettings((p) => ({ ...p, releaseChannel: e.target.value }))} className="hp-input" style={{ fontSize: 13 }}>
          <option value="stable">Stable (recommended)</option>
          <option value="alpha">Alpha (early features, frequent updates)</option>
        </select>
      </div>
      <div style={{ paddingTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.checkOnStartup} onChange={(e) => setSettings((p) => ({ ...p, checkOnStartup: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Check for updates on app startup</span>
        </label>
      </div>
      <div style={{ paddingTop: 8 }}>
        {settings.lastChecked
          ? <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Last checked: {new Date(settings.lastChecked).toLocaleDateString()}</p>
          : <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Never checked</p>}
      </div>
      <div style={{ paddingTop: 8 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
