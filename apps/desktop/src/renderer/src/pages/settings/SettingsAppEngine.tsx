import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { AppEngineSettings } from '@linux-dev-home/shared'
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

const DEFAULTS: AppEngineSettings = { ipcTimeoutMs: 30000, threadPoolSize: 4, daemonAutoRestart: true }

export function SettingsAppEngine(): ReactElement {
  const { t } = useTranslation('settings')
  const [settings, setSettings] = useState<AppEngineSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [msgIsError, setMsgIsError] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'app_engine_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<AppEngineSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'app_engine_settings', data: settings }))
      setMsg(t('appEngine.saved'))
      setMsgIsError(false)
      setTimeout(() => setMsg(null), 4000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('appEngine.saveFailed'))
      setMsgIsError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard description={t('appEngine.restartNote')}>
        <SettingsRow label={t('appEngine.ipcTimeout')} description={t('appEngine.ipcTimeoutDesc')}>
          <input
            type="number"
            className="hp-input"
            style={{ fontSize: 13, width: 120 }}
            min={1000}
            max={120000}
            value={settings.ipcTimeoutMs}
            onChange={(e) => setSettings((p) => ({ ...p, ipcTimeoutMs: Math.max(1000, Math.min(120000, Number(e.target.value))) }))}
          />
        </SettingsRow>
        <SettingsRow label={t('appEngine.threadPoolSize')}>
          <input
            type="number"
            className="hp-input"
            style={{ fontSize: 13, width: 80 }}
            min={1}
            max={32}
            value={settings.threadPoolSize}
            onChange={(e) => setSettings((p) => ({ ...p, threadPoolSize: Math.max(1, Math.min(32, Number(e.target.value))) }))}
          />
        </SettingsRow>
        <SettingsRow label={t('appEngine.daemonAutoRestart')} description={t('appEngine.daemonAutoRestartDesc')} last>
          <SettingsToggle
            checked={settings.daemonAutoRestart}
            onChange={(v) => setSettings((p) => ({ ...p, daemonAutoRestart: v }))}
          />
        </SettingsRow>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('appEngine.saving') : t('appEngine.save')}
        </button>
      </SettingsActions>
      {msg ? <SettingsFeedback tone={msgIsError ? 'error' : 'success'}>{msg}</SettingsFeedback> : null}
    </SettingsStack>
  )
}
