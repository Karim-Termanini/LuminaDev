import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
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

type UpdateSettings = { releaseChannel: string; checkOnStartup: boolean; lastChecked?: number }
const DEFAULTS: UpdateSettings = { releaseChannel: 'stable', checkOnStartup: true }

export function SettingsUpdate(): ReactElement {
  const { t } = useTranslation('settings')
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
      setMsg({ text: t('update.saved'), type: 'success' })
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('update.saveFailed'), type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function checkForUpdates(): Promise<void> {
    setChecking(true)
    setMsg(null)
    try {
      const res = await window.dh.appUpdateCheck()
      if (res.ok) {
        const { updateAvailable, latestVersion, currentVersion } = res
        if (updateAvailable) {
          setMsg({ text: t('update.available', { latestVersion: latestVersion ?? '?', currentVersion: currentVersion ?? '?' }), type: 'info' })
          const newData = { ...settings, lastChecked: Date.now() }
          setSettings(newData)
          await window.dh.storeSet({ key: 'update_settings', data: newData })
        } else {
          setMsg({ text: t('update.upToDate', { version: currentVersion ?? '?' }), type: 'success' })
        }
      } else {
        throw new Error(res.error || 'Failed to check for updates.')
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : t('update.checkFailed'), type: 'error' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard title={t('update.softwareUpdate')} description={t('update.checkDesc')}>
        <SettingsRow label={t('update.checkNow')} description={t('update.checkDesc')} last>
          <button type="button" className="hp-btn" onClick={() => void checkForUpdates()} disabled={checking}>
            {checking ? t('update.checking') : t('update.checkNow')}
          </button>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard title={t('update.releaseChannel')}>
        <SettingsRow label={t('update.releaseChannel')} last>
          <select
            value={settings.releaseChannel}
            onChange={(e) => setSettings((p) => ({ ...p, releaseChannel: e.target.value }))}
            className="hp-input"
            style={{ fontSize: 13, minWidth: 160 }}
          >
            <option value="stable">{t('update.stable')}</option>
            <option value="alpha">{t('update.alpha')}</option>
          </select>
        </SettingsRow>
      </SettingsCard>
      <SettingsCard>
        <SettingsRow label={t('update.checkOnStartup')} last>
          <SettingsToggle
            checked={settings.checkOnStartup}
            onChange={(v) => setSettings((p) => ({ ...p, checkOnStartup: v }))}
          />
        </SettingsRow>
      </SettingsCard>
      <p className="settings-feedback settings-feedback-muted" style={{ margin: 0 }}>
        {settings.lastChecked
          ? t('update.lastChecked', { date: new Date(settings.lastChecked).toLocaleString() })
          : t('update.neverChecked')}
      </p>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('update.saving') : t('update.save')}
        </button>
      </SettingsActions>
      {msg ? (
        <SettingsFeedback tone={msg.type === 'error' ? 'error' : msg.type === 'success' ? 'success' : 'info'}>
          {msg.text}
        </SettingsFeedback>
      ) : null}
    </SettingsStack>
  )
}
