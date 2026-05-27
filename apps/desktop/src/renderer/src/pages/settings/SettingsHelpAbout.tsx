import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  }, [])

  const rows: Array<{ label: string; value: string }> = info ? [
    { label: t('helpAbout.version'), value: info.version },
    { label: t('helpAbout.buildDate'), value: info.buildDate },
    { label: t('helpAbout.platform'), value: info.platform },
    { label: t('helpAbout.rust'), value: info.rustVersion },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="codicon codicon-info" style={{ fontSize: 40, color: 'var(--accent)', opacity: 0.85 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>{t('helpAbout.appName')}</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{t('helpAbout.appTagline')}</p>
        </div>
      </div>
      {err ? <div className="hp-status-alert error">{err}</div> : null}
      {!info && !err ? <p className="hp-muted" style={{ fontSize: 13 }}>{t('helpAbout.loading')}</p> : null}
      {rows.length > 0 ? (
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px 10px 0', fontWeight: 600, width: 120, color: 'var(--text-muted)' }}>{r.label}</td>
                <td className="mono" style={{ padding: '10px 0' }}>{r.value}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 16px 10px 0', fontWeight: 600, color: 'var(--text-muted)' }}>{t('helpAbout.license')}</td>
              <td style={{ padding: '10px 0', fontSize: 13 }}>{t('helpAbout.mit')}</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="hp-btn" style={{ fontSize: 13 }}
          onClick={() => { void window.dh.openExternal('https://github.com/karimodora/LuminaDev') }}>
          <span className="codicon codicon-github" aria-hidden /> {t('helpAbout.github')}
        </button>
      </div>
    </div>
  )
}
