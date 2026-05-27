import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { AppEngineSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from 'react-i18next'

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>{t('appEngine.restartNote')}</p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('appEngine.ipcTimeout')}</label>
        <input type="number" className="hp-input" style={{ fontSize: 13, width: 160 }}
          min={1000} max={120000} value={settings.ipcTimeoutMs}
          onChange={(e) => setSettings((p) => ({ ...p, ipcTimeoutMs: Math.max(1000, Math.min(120000, Number(e.target.value))) }))} />
        <p className="hp-muted" style={{ marginTop: 6, fontSize: 12 }}>{t('appEngine.ipcTimeoutDesc')}</p>
      </div>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('appEngine.threadPoolSize')}</label>
        <input type="number" className="hp-input" style={{ fontSize: 13, width: 100 }}
          min={1} max={32} value={settings.threadPoolSize}
          onChange={(e) => setSettings((p) => ({ ...p, threadPoolSize: Math.max(1, Math.min(32, Number(e.target.value))) }))} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('appEngine.daemonAutoRestart')}</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{t('appEngine.daemonAutoRestartDesc')}</p>
        </div>
        <button type="button" role="switch" aria-checked={settings.daemonAutoRestart}
          onClick={() => setSettings((p) => ({ ...p, daemonAutoRestart: !p.daemonAutoRestart }))}
          style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            background: settings.daemonAutoRestart ? 'var(--accent)' : 'var(--border)' }}>
          <span style={{ position: 'absolute', top: 3, left: settings.daemonAutoRestart ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </button>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? t('appEngine.saving') : t('appEngine.save')}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msgIsError ? 'var(--red)' : 'var(--green)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
