import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
export function SettingsExtension(): ReactElement {
  const { t } = useTranslation('settings')
  return (
    <div style={{ paddingTop: 12, textAlign: 'center' }}>
      <span className="codicon codicon-extensions" style={{ fontSize: 32, opacity: 0.4, marginBottom: 12, display: 'block' }} aria-hidden />
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>{t('extension.comingSoon')}</p>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, marginInline: 'auto' }}>{t('extension.description')}</p>
    </div>
  )
}
