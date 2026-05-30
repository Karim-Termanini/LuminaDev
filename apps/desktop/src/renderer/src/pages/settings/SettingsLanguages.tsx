import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { useI18nBridge } from '../../i18n/I18nContext'
import { SettingsCard, SettingsRow, SettingsStack } from './SettingsUi'

export function SettingsLanguages(): ReactElement {
  const { t, i18n } = useTranslation('settings')
  const { setLocale } = useI18nBridge()
  const currentLocale = i18n.language

  const languages = [
    { value: 'en-US', label: t('languages.english') },
    { value: 'de-DE', label: t('languages.german') },
    { value: 'ar-SA', label: t('languages.arabic') },
  ]

  return (
    <SettingsStack>
      <SettingsCard description={t('languages.description')}>
        <SettingsRow label={t('languages.displayLanguage')} last>
          <select
            className="hp-input"
            style={{ fontSize: 13, minWidth: 200 }}
            value={currentLocale}
            onChange={(e) => void setLocale(e.target.value)}
          >
            {languages.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </SettingsRow>
      </SettingsCard>
      <p className="settings-feedback settings-feedback-muted" style={{ margin: 0 }}>{t('languages.restartNote')}</p>
    </SettingsStack>
  )
}
