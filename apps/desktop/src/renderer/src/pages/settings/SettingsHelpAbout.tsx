import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsActions, SettingsCard, SettingsStack } from './SettingsUi'

type AppInfo = { version: string; buildDate: string; rustVersion: string; platform: string }

export function SettingsHelpAbout(): ReactElement {
  const { t } = useTranslation('settings')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.appInfo()
      .then((res) => {
        if (res.ok) {
          setInfo({
            version: res.version,
            buildDate: res.buildDate,
            rustVersion: res.rustVersion,
            platform: res.platform,
          })
        } else {
          setErr(res.error ?? t('helpAbout.loading'))
        }
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : t('helpAbout.loading')))
  }, [t])

  const rows: Array<{ label: string; value: string }> = info ? [
    { label: t('helpAbout.version'), value: info.version },
    { label: t('helpAbout.buildDate'), value: info.buildDate },
    { label: t('helpAbout.platform'), value: info.platform },
    { label: t('helpAbout.rust'), value: info.rustVersion },
    { label: t('helpAbout.license'), value: t('helpAbout.mit') },
  ] : []

  return (
    <SettingsStack>
      <div className="settings-about-hero">
        <span className="codicon codicon-info" aria-hidden />
        <div>
          <div className="settings-about-title">{t('helpAbout.appName')}</div>
          <p className="settings-feedback settings-feedback-muted" style={{ margin: '4px 0 0' }}>{t('helpAbout.appTagline')}</p>
        </div>
      </div>
      {err ? <div className="hp-status-alert error">{err}</div> : null}
      {!info && !err ? <p className="settings-feedback settings-feedback-muted">{t('helpAbout.loading')}</p> : null}
      {rows.length > 0 ? (
        <SettingsCard>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className={`settings-row${i === rows.length - 1 ? ' settings-row-last' : ''}`}
              style={{ gridTemplateColumns: '140px 1fr' }}
            >
              <div className="settings-row-label" style={{ color: 'var(--text-muted)' }}>{r.label}</div>
              <div className="mono" style={{ fontSize: 13, wordBreak: 'break-word' }}>{r.value}</div>
            </div>
          ))}
        </SettingsCard>
      ) : null}
      <SettingsActions>
        <button
          type="button"
          className="hp-btn"
          onClick={() => { void window.dh.openExternal('https://github.com/karimodora/LuminaDev') }}
        >
          <span className="codicon codicon-github" aria-hidden /> {t('helpAbout.github')}
        </button>
      </SettingsActions>
    </SettingsStack>
  )
}
