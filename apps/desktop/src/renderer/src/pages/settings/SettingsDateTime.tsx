import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { DateTimeSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: DateTimeSettings = {
  format: '24h',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

export function SettingsDateTime(): ReactElement {
  const [settings, setSettings] = useState<DateTimeSettings>(DEFAULTS)
  const [tzFilter, setTzFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const allTimezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch {
      return [DEFAULTS.timezone]
    }
  }, [])

  const filteredTz = useMemo(() => {
    const q = tzFilter.trim().toLowerCase()
    return q ? allTimezones.filter((tz) => tz.toLowerCase().includes(q)) : allTimezones
  }, [allTimezones, tzFilter])

  useEffect(() => {
    void window.dh.storeGet({ key: 'datetime_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setSettings({ ...DEFAULTS, ...(res.data as Partial<DateTimeSettings>) })
      }
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'datetime_settings', data: settings }))
      document.documentElement.dataset.timeformat = settings.format
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Time format</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['12h', '24h'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setSettings((p) => ({ ...p, format: f }))}
              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: settings.format === f ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: settings.format === f ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: settings.format === f ? 'var(--accent)' : 'var(--text)' }}>
              {f === '12h' ? '12-hour' : '24-hour'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Timezone</div>
        <input type="search" className="hp-input" placeholder="Filter timezones…" value={tzFilter}
          onChange={(e) => setTzFilter(e.target.value)} style={{ marginBottom: 8, fontSize: 13, width: '100%', maxWidth: 360 }} />
        <select value={settings.timezone} onChange={(e) => setSettings((p) => ({ ...p, timezone: e.target.value }))}
          className="hp-input" style={{ fontSize: 13, width: '100%', maxWidth: 360 }}>
          {filteredTz.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {filteredTz.length} of {allTimezones.length} timezones shown
        </p>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
