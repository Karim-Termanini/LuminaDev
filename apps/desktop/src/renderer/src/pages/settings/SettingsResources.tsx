import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ResourcesSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: ResourcesSettings = { cpuLimitPercent: 80, ramLimitMb: 4096 }

export function SettingsResources(): ReactElement {
  const [settings, setSettings] = useState<ResourcesSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'resources_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<ResourcesSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'resources_settings', data: settings }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
        These limits will be enforced by the job runner in a future release.
      </p>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>CPU limit</label>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{settings.cpuLimitPercent}%</span>
        </div>
        <input type="range" min={10} max={100} step={5} value={settings.cpuLimitPercent}
          onChange={(e) => setSettings((p) => ({ ...p, cpuLimitPercent: Number(e.target.value) }))}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>10%</span><span>100%</span>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>RAM allocation</label>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{settings.ramLimitMb >= 1024 ? `${settings.ramLimitMb / 1024} GB` : `${settings.ramLimitMb} MB`}</span>
        </div>
        <input type="range" min={512} max={16384} step={512} value={settings.ramLimitMb}
          onChange={(e) => setSettings((p) => ({ ...p, ramLimitMb: Number(e.target.value) }))}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>512 MB</span><span>16 GB</span>
        </div>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
