import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { NotificationSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsFeedback,
  SettingsRow,
  SettingsStack,
  SettingsToggle,
} from './SettingsUi'

const DEFAULTS: NotificationSettings = { globalMute: false, minSeverity: 'info', osNotifications: false }

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
    <SettingsStack>
      <SettingsCard description={t('notification.description')}>
        <SettingsRow label={t('notification.globalMute')} description={t('notification.globalMuteDesc')}>
          <SettingsToggle
            checked={!!settings.globalMute}
            onChange={(v) => setSettings((p) => ({ ...p, globalMute: v }))}
          />
        </SettingsRow>
        <SettingsRow label={t('notification.minimumSeverity')} description={t('notification.description')}>
          <select
            value={settings.minSeverity}
            onChange={(e) => setSettings((p) => ({ ...p, minSeverity: e.target.value as NotificationSettings['minSeverity'] }))}
            className="hp-input"
            style={{ fontSize: 13, minWidth: 140 }}
          >
            <option value="info">{t('notification.severityInfo')}</option>
            <option value="warn">{t('notification.severityWarn')}</option>
            <option value="error">{t('notification.severityError')}</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t('notification.osNative')} description={t('notification.osNativeDesc')} last>
          <SettingsToggle checked={false} onChange={() => {}} disabled />
        </SettingsRow>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('notification.saving') : t('notification.save')}
        </button>
      </SettingsActions>
      {msg ? (
        <SettingsFeedback tone={msg === t('notification.saved') ? 'success' : 'error'}>{msg}</SettingsFeedback>
      ) : null}
    </SettingsStack>
  )
}
