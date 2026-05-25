import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

type AppInfo = { version: string; buildDate: string; rustVersion: string; platform: string }

export function SettingsHelpAbout(): ReactElement {
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
          setErr(res.error ?? 'Failed to load app info.')
        }
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Failed to load app info.'))
  }, [])

  const rows: Array<{ label: string; value: string }> = info ? [
    { label: 'Version', value: info.version },
    { label: 'Build date', value: info.buildDate },
    { label: 'Platform', value: info.platform },
    { label: 'Rust', value: info.rustVersion },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="codicon codicon-info" style={{ fontSize: 40, color: 'var(--accent)', opacity: 0.85 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>LuminaDev</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Linux Dev Home — desktop environment manager</p>
        </div>
      </div>
      {err ? <div className="hp-status-alert error">{err}</div> : null}
      {!info && !err ? <p className="hp-muted" style={{ fontSize: 13 }}>Loading…</p> : null}
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
              <td style={{ padding: '10px 16px 10px 0', fontWeight: 600, color: 'var(--text-muted)' }}>License</td>
              <td style={{ padding: '10px 0', fontSize: 13 }}>MIT</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="hp-btn" style={{ fontSize: 13 }}
          onClick={() => { void window.dh.openExternal('https://github.com/karimodora/LuminaDev') }}>
          <span className="codicon codicon-github" aria-hidden /> GitHub
        </button>
      </div>
    </div>
  )
}
