import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export function DashboardWidgetsPage(): ReactElement {
  const { t } = useTranslation('dashboard')
  return (
    <div style={{ padding: 32, color: 'var(--text)' }}>
      <h2 style={{ margin: '0 0 8px', fontWeight: 700 }}>{t('widgets.title')}</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
        {t('widgets.comingSoon')}
      </p>
    </div>
  )
}
