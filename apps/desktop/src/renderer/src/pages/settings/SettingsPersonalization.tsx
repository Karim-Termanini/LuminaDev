import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { parseAppearance } from '@linux-dev-home/shared'
import { applyAppearanceAccent, applyTheme, DEFAULT_ACCENT_HEX } from '../../theme/applyAccent'
import { assertSettingsOk } from '../settingsContract'

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Violet', hex: '#7c4dff' },
  { label: 'Blue', hex: '#1976d2' },
  { label: 'Green', hex: '#43a047' },
  { label: 'Coral', hex: '#ff7043' },
  { label: 'Teal', hex: '#00897b' },
]

export function SettingsPersonalization(): ReactElement {
  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    void window.dh.storeGet({ key: 'appearance' }).then((ap) => {
      if (ap.ok) {
        const parsed = parseAppearance(ap.data)
        setAccentDraft(parsed.accent ?? DEFAULT_ACCENT_HEX)
        setThemeMode(parsed.theme ?? 'dark')
      }
    })
  }, [])

  async function saveAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({ key: 'appearance', data: { accent: accentDraft, theme: themeMode } })
      assertSettingsOk(res)
      applyAppearanceAccent(accentDraft)
      applyTheme(themeMode)
      setAccentMsg('Accent saved.')
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setAccentBusy(false)
    }
  }

  async function resetAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({ key: 'appearance', data: { theme: themeMode } })
      assertSettingsOk(res)
      setAccentDraft(DEFAULT_ACCENT_HEX)
      applyAppearanceAccent(undefined)
      applyTheme(themeMode)
      setAccentMsg('Restored default accent.')
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setAccentBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Color theme</div>
          <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>Choose between a dark or light interface.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => { setThemeMode(t); applyTheme(t) }}
              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: themeMode === t ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: themeMode === t ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: themeMode === t ? 'var(--accent)' : 'var(--text)', transition: 'all 0.15s ease' }}>
              <span className={`codicon codicon-${t === 'dark' ? 'moon' : 'sun'}`} style={{ marginRight: 6 }} aria-hidden />
              {t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Accent color</div>
          <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>Controls the global <span className="mono">--accent</span> design token.</p>
        </div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          {ACCENT_PRESETS.map((p) => (
            <button key={p.hex} type="button" title={p.label} onClick={() => setAccentDraft(p.hex)}
              style={{ width: 40, height: 40, borderRadius: 10, cursor: 'pointer', background: p.hex,
                border: accentDraft.toLowerCase() === p.hex ? '2px solid var(--text)' : '1px solid var(--border)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)', paddingLeft: 4 }}>
            Custom
            <input type="color" value={accentDraft} onChange={(ev) => setAccentDraft(ev.target.value)}
              style={{ width: 44, height: 40, padding: 0, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-input)' }} />
          </label>
        </div>
      </div>
      <div className="hp-row-wrap">
        <button type="button" className="hp-btn hp-btn-primary" disabled={accentBusy} onClick={() => void saveAccent()}>Save</button>
        <button type="button" className="hp-btn" disabled={accentBusy} onClick={() => void resetAccent()}>Reset to default</button>
      </div>
      {accentMsg ? (
        <div className={`hp-status-alert ${accentMsg.toLowerCase().includes('could not') || accentMsg.toLowerCase().includes('failed') ? 'error' : 'success'}`} style={{ marginTop: 4 }}>{accentMsg}</div>
      ) : null}
    </div>
  )
}
