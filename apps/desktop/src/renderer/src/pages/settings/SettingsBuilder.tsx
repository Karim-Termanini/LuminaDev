import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { BuilderSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'

const DEFAULTS: BuilderSettings = { cargoPath: '', nodePath: '', pythonPath: '', registryMirror: 'https://registry.npmjs.org' }

function PathRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): ReactElement {
  const { t } = useTranslation('settings')
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" className="hp-input" style={{ flex: 1, fontSize: 13 }}
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('builder.autoDetect')} />
        <button type="button" className="hp-btn" style={{ padding: '8px 12px' }}
          onClick={() => { void window.dh.selectFolder().then((p) => { if (p) onChange(p) }) }}>
          <span className="codicon codicon-folder-open" aria-hidden />
        </button>
      </div>
    </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PathRow label={t('builder.cargoPath')} value={settings.cargoPath} onChange={(v) => setSettings((p) => ({ ...p, cargoPath: v }))} />
      <PathRow label={t('builder.nodePath')} value={settings.nodePath} onChange={(v) => setSettings((p) => ({ ...p, nodePath: v }))} />
      <PathRow label={t('builder.pythonPath')} value={settings.pythonPath} onChange={(v) => setSettings((p) => ({ ...p, pythonPath: v }))} />
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('builder.registryMirror')}</label>
        <input type="text" className="hp-input" style={{ width: '100%', fontSize: 13 }}
          value={settings.registryMirror} onChange={(e) => setSettings((p) => ({ ...p, registryMirror: e.target.value }))}
          placeholder="https://registry.npmjs.org" />
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? t('builder.saving') : t('builder.save')}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === t('builder.saved') ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
