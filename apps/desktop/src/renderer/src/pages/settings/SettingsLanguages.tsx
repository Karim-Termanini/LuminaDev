import type { ReactElement } from 'react'
import { useState } from 'react'
import { assertSettingsOk } from '../settingsContract'
import { useTranslation } from '../../i18n/I18nContext'
import { Locale } from '../../i18n/translations'

const FUTURE_LOCALES = [
  { locale: 'fr-FR', label: 'Français' },
  { locale: 'de-DE', label: 'Deutsch' },
  { locale: 'es-ES', label: 'Español' },
  { locale: 'zh-CN', label: '中文' },
]

export function SettingsLanguages(): ReactElement {
  const { locale, setLocale, t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save(newLocale: Locale): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(
        await window.dh.storeSet({
          key: 'language_settings',
          data: { locale: newLocale },
        })
      )
      setLocale(newLocale)
      setMsg(t('saved'))
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
        Select your preferred language. RTL layout is automatically applied for Arabic.
      </p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
          {t('displayLanguage')}
        </label>
        <select 
          className="hp-input" 
          style={{ fontSize: 13, width: 240 }} 
          value={locale} 
          onChange={(e) => void save(e.target.value as Locale)}
          disabled={busy}
        >
          <option value="en-US">English (en-US)</option>
          <option value="ar-SA">العربية (ar-SA)</option>
          {FUTURE_LOCALES.map((l) => (
            <option key={l.locale} value={l.locale} disabled>
              {l.label} — {t('comingSoon')}
            </option>
          ))}
        </select>
      </div>
      {msg ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === t('saved') ? 'var(--green)' : 'var(--red)' }}>
          {msg}
        </p>
      ) : null}
    </div>
  )
}
