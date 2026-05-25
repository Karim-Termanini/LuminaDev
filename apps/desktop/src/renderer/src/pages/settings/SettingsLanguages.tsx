import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { LanguageSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const FUTURE_LOCALES = [
  { locale: 'fr-FR', label: 'Français' },
  { locale: 'de-DE', label: 'Deutsch' },
  { locale: 'es-ES', label: 'Español' },
  { locale: 'ar-SA', label: 'العربية' },
  { locale: 'zh-CN', label: '中文' },
]

export function SettingsLanguages(): ReactElement {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'language_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        const data = res.data as Partial<LanguageSettings>
        if (data.locale === 'en-US') {
          setSaved(true)
        }
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(
        await window.dh.storeSet({
          key: 'language_settings',
          data: { locale: 'en-US' },
        })
      )
      document.documentElement.lang = 'en'
      setSaved(true)
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
        Additional languages coming in a future release.
      </p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
          Display language
        </label>
        <select className="hp-input" style={{ fontSize: 13, width: 240 }} value="en-US" disabled={false}>
          <option value="en-US">English (en-US)</option>
          {FUTURE_LOCALES.map((l) => (
            <option key={l.locale} value={l.locale} disabled>
              {l.label} — coming soon
            </option>
          ))}
        </select>
      </div>
      {!saved ? (
        <div>
          <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {msg ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>
              {msg}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="hp-muted" style={{ fontSize: 12, margin: 0 }}>
          en-US saved.
        </p>
      )}
    </div>
  )
}
