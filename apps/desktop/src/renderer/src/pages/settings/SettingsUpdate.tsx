import { invoke } from '@tauri-apps/api/core'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

type UpdateSettings = { releaseChannel: string; checkOnStartup: boolean; lastChecked?: number }
const DEFAULTS: UpdateSettings = { releaseChannel: 'stable', checkOnStartup: true }

export function SettingsUpdate(): ReactElement {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULTS)
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'update_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings(res.data as UpdateSettings)
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const data = { releaseChannel: settings.releaseChannel as 'stable' | 'alpha', checkOnStartup: settings.checkOnStartup, lastChecked: settings.lastChecked }
      assertSettingsOk(await window.dh.storeSet({ key: 'update_settings', data }))
      setSettings(data)
      setMsg({ text: 'Settings saved.', type: 'success' })
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Save failed.', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function checkForUpdates(): Promise<void> {
    setChecking(true)
    setMsg(null)
    try {
      const res = await invoke<{ ok: boolean; updateAvailable?: boolean; latestVersion?: string; currentVersion?: string; url?: string; error?: string }>('ipc_invoke', { channel: 'dh:app:update:check', payload: {} })
      if (res.ok) {
        const { updateAvailable, latestVersion, currentVersion } = res
        if (updateAvailable) {
          setMsg({ text: `Update available: ${latestVersion} (current: ${currentVersion})`, type: 'info' })
          // Optionally save lastChecked
          const newData = { ...settings, lastChecked: Date.now() }
          setSettings(newData)
          await window.dh.storeSet({ key: 'update_settings', data: newData })
        } else {
          setMsg({ text: `You are on the latest version (${currentVersion}).`, type: 'success' })
        }
      } else {
        throw new Error(res.error || 'Failed to check for updates.')
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Update check failed.', type: 'error' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Software Update</div>
            <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Check for the latest version of LuminaDev.</p>
          </div>
          <button type="button" className="hp-btn" onClick={() => void checkForUpdates()} disabled={checking} style={{ fontSize: 13, padding: '6px 12px' }}>
            {checking ? 'Checking...' : 'Check now'}
          </button>
        </div>
        
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Release channel</div>
        <select value={settings.releaseChannel} onChange={(e) => setSettings((p) => ({ ...p, releaseChannel: e.target.value }))} className="hp-input" style={{ fontSize: 13, width: 240 }}>
          <option value="stable">Stable (recommended)</option>
          <option value="alpha">Alpha (early features, frequent updates)</option>
        </select>
      </div>
      <div style={{ paddingTop: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.checkOnStartup} onChange={(e) => setSettings((p) => ({ ...p, checkOnStartup: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Check for updates on app startup</span>
        </label>
      </div>
      <div style={{ paddingTop: 0 }}>
        {settings.lastChecked
          ? <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Last checked: {new Date(settings.lastChecked).toLocaleString()}</p>
          : <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Never checked</p>}
      </div>
      <div style={{ paddingTop: 8 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? (
          <p style={{ 
            margin: '12px 0 0', 
            fontSize: 13, 
            color: msg.type === 'error' ? 'var(--red)' : msg.type === 'success' ? 'var(--green)' : 'var(--accent)' 
          }}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  )
}
