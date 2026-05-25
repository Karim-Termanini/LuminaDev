import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { LanguagesSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: LanguagesSettings = { language: 'en' }

const LANGUAGES: ReadonlyArray<{ code: LanguagesSettings['language']; name: string; nativeName: string }> = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
]

export function SettingsLanguages(): ReactElement {
  const [settings, setSettings] = useState<LanguagesSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'languages_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<LanguagesSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'languages_settings', data: settings }))
      document.documentElement.lang = settings.language
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>App language</label>
        <select value={settings.language} onChange={(e) => setSettings({ language: e.target.value as LanguagesSettings['language'] })}
          className="hp-input" style={{ fontSize: 13, width: '100%', maxWidth: 320 }}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name} ({l.nativeName})
            </option>
          ))}
        </select>
        <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          Changes the language of standard labels. Fully localized assets coming soon.
        </p>
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
