import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useI18nBridge } from '../../i18n/I18nContext'
import { useBetaFlags } from '../../hooks/useBetaFlags'

export function SettingsLanguages(): ReactElement {
  const { t, i18n } = useTranslation('settings')
  const { setLocale } = useI18nBridge()
  const flags = useBetaFlags()
  const currentLocale = i18n.language

  const languages = [
    { value: 'en-US', label: t('languages.english') },
    { value: 'de-DE', label: t('languages.german') },
    ...(flags.rtl_arabic ? [{ value: 'ar-SA', label: t('languages.arabic') }] : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
        {t('languages.description')}
      </p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
          {t('languages.displayLanguage')}
        </label>
        <select
          className="hp-input"
          style={{ fontSize: 13, width: 240 }}
          value={currentLocale}
          onChange={(e) => void setLocale(e.target.value)}
        >
          {languages.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
        {t('languages.restartNote')}
      </p>
    </div>
  )
}
