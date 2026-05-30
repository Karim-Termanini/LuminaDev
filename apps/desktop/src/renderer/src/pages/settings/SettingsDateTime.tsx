import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { DateTimeSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsFeedback,
  SettingsRow,
  SettingsSegmented,
  SettingsStack,
} from './SettingsUi'

const DEFAULTS: DateTimeSettings = {
  format: '24h',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

export function SettingsDateTime(): ReactElement {
  const { t } = useTranslation('settings')
  const [settings, setSettings] = useState<DateTimeSettings>(DEFAULTS)
  const [tzFilter, setTzFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const allTimezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [DEFAULTS.timezone]
    }
  }, [])

  const filteredTz = useMemo(() => {
    const q = tzFilter.trim().toLowerCase()
    return q ? allTimezones.filter((tz) => tz.toLowerCase().includes(q)) : allTimezones
  }, [allTimezones, tzFilter])

  useEffect(() => {
    void window.dh.storeGet({ key: 'datetime_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<DateTimeSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'datetime_settings', data: settings }))
      document.documentElement.dataset.timeformat = settings.format
      setMsg(t('dateTime.saved'))
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('dateTime.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard title={t('dateTime.timeFormat')}>
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'flex-end' }}>
          <SettingsSegmented
            value={settings.format}
            options={[
              { value: '12h', label: t('dateTime.twelveHour') },
              { value: '24h', label: t('dateTime.twentyFourHour') },
            ]}
            onChange={(f) => setSettings((p) => ({ ...p, format: f }))}
          />
        </div>
      </SettingsCard>
      <SettingsCard title={t('dateTime.timezone')}>
        <SettingsRow label={t('dateTime.filterTimezones')} last>
          <input
            type="search"
            className="hp-input"
            placeholder={t('dateTime.filterTimezones')}
            value={tzFilter}
            onChange={(e) => setTzFilter(e.target.value)}
            style={{ fontSize: 13, minWidth: 220 }}
          />
        </SettingsRow>
        <select
          value={settings.timezone}
          onChange={(e) => setSettings((p) => ({ ...p, timezone: e.target.value }))}
          className="hp-input"
          style={{ fontSize: 13, width: '100%', marginBottom: 8 }}
        >
          {filteredTz.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <p className="settings-feedback settings-feedback-muted" style={{ margin: 0 }}>
          {t('dateTime.timezonesShown', { count: filteredTz.length, total: allTimezones.length })}
        </p>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('dateTime.saving') : t('dateTime.save')}
        </button>
      </SettingsActions>
      {msg ? (
        <SettingsFeedback tone={msg === t('dateTime.saved') ? 'success' : 'error'}>{msg}</SettingsFeedback>
      ) : null}
    </SettingsStack>
  )
}
