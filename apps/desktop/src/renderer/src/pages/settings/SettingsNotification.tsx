import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { NotificationSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('settings')
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
      setMsg(t('notification.saved'))
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('notification.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <p className="hp-muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        {t('notification.description')}
      </p>
      {[
        { key: 'globalMute' as const, label: t('notification.globalMute'), description: t('notification.globalMuteDesc') },
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
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('notification.minimumSeverity')}</label>
        <select value={settings.minSeverity} onChange={(e) => setSettings((p) => ({ ...p, minSeverity: e.target.value as NotificationSettings['minSeverity'] }))}
          className="hp-input" style={{ fontSize: 13 }}>
          <option value="info">{t('notification.severityInfo')}</option>
          <option value="warn">{t('notification.severityWarn')}</option>
          <option value="error">{t('notification.severityError')}</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('notification.osNative')}</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {t('notification.osNativeDesc')}
          </p>
        </div>
        <Toggle checked={false} onChange={() => {}} disabled />
      </div>
      <div style={{ paddingTop: 16 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? t('notification.saving') : t('notification.save')}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === t('notification.saved') ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
