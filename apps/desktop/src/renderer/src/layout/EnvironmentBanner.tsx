import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export function EnvironmentBanner(): ReactElement {
  const { t } = useTranslation('common')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        await window.dh.sessionInfo()
        setLoaded(true)
      } catch {
        setLoaded(true)
      }
    })()
  }, [])

  if (!loaded) {
    return (
      <div
        style={{
          flexShrink: 0,
          padding: '8px 24px',
          fontSize: 12,
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
        }}
      >
        {t('envBanner.detecting')}
      </div>
    )
  }

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 24px',
        fontSize: 13,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(124, 77, 255, 0.06)',
      }}
    >
      <span
        className="codicon codicon-shield"
        style={{ color: 'var(--green)', fontSize: 16 }}
        title={t('envBanner.nativeSession')}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 200 }}>
        <strong style={{ color: 'var(--text)' }}>{t('envBanner.nativeSession')}</strong>
      </div>
    </div>
  )
}
