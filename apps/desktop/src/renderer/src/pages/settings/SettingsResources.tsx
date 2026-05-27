import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ResourcesSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'

const DEFAULTS: ResourcesSettings = { cpuLimitPercent: 80, ramLimitMb: 4096 }

export function SettingsResources(): ReactElement {
  const { t } = useTranslation('settings')
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
      setMsg(t('resources.saved'))
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('resources.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(0, 230, 118, 0.08)', border: '1px solid rgba(0, 230, 118, 0.25)', borderRadius: 6, fontSize: 12, color: 'var(--green, #00e676)' }}>
        <span className="codicon codicon-check" />
        {t('resources.infoBox')}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>{t('resources.cpuLimit')}</label>
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
          <label style={{ fontWeight: 600, fontSize: 14 }}>{t('resources.ramAllocation')}</label>
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
          {busy ? t('resources.saving') : t('resources.save')}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === t('resources.saved') ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
