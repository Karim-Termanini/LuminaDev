import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { BuilderSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'
import {
  SettingsActions,
  SettingsCard,
  SettingsFeedback,
  SettingsRow,
  SettingsStack,
} from './SettingsUi'

const DEFAULTS: BuilderSettings = { cargoPath: '', nodePath: '', pythonPath: '', registryMirror: 'https://registry.npmjs.org' }

function PathRow({
  label,
  value,
  onChange,
  last,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  last?: boolean
}): ReactElement {
  const { t } = useTranslation('settings')
  return (
    <SettingsRow label={label} last={last}>
      <div style={{ display: 'flex', gap: 8, minWidth: 280, flex: '1 1 280px', justifyContent: 'flex-end' }}>
        <input
          type="text"
          className="hp-input"
          style={{ flex: 1, fontSize: 13, minWidth: 160 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('builder.autoDetect')}
        />
        <button
          type="button"
          className="hp-btn"
          onClick={() => { void window.dh.selectFolder().then((p) => { if (p) onChange(p) }) }}
        >
          <span className="codicon codicon-folder-open" aria-hidden />
        </button>
      </div>
    </SettingsRow>
  )
}

export function SettingsBuilder(): ReactElement {
  const { t } = useTranslation('settings')
  const [settings, setSettings] = useState<BuilderSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'builder_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<BuilderSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'builder_settings', data: settings }))
      setMsg(t('builder.saved'))
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t('builder.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsStack>
      <SettingsCard title={t('shell.navBuilder')}>
        <PathRow label={t('builder.cargoPath')} value={settings.cargoPath} onChange={(v) => setSettings((p) => ({ ...p, cargoPath: v }))} />
        <PathRow label={t('builder.nodePath')} value={settings.nodePath} onChange={(v) => setSettings((p) => ({ ...p, nodePath: v }))} />
        <PathRow label={t('builder.pythonPath')} value={settings.pythonPath} onChange={(v) => setSettings((p) => ({ ...p, pythonPath: v }))} />
        <SettingsRow label={t('builder.registryMirror')} last>
          <input
            type="text"
            className="hp-input"
            style={{ fontSize: 13, minWidth: 240, flex: 1 }}
            value={settings.registryMirror}
            onChange={(e) => setSettings((p) => ({ ...p, registryMirror: e.target.value }))}
            placeholder="https://registry.npmjs.org"
          />
        </SettingsRow>
      </SettingsCard>
      <SettingsActions>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? t('builder.saving') : t('builder.save')}
        </button>
      </SettingsActions>
      {msg ? (
        <SettingsFeedback tone={msg === t('builder.saved') ? 'success' : 'error'}>{msg}</SettingsFeedback>
      ) : null}
    </SettingsStack>
  )
}
