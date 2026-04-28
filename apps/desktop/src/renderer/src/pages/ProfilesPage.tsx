import { CustomProfilesStoreSchema, type CustomProfileEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'

export function ProfilesPage(): ReactElement {
  const [profiles, setProfiles] = useState<CustomProfileEntry[]>([])
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  async function load(): Promise<void> {
    try {
      const stored = await window.dh.storeGet({ key: 'custom_profiles' })
      if (!stored) {
        setProfiles([])
        return
      }
      const parsed = CustomProfilesStoreSchema.parse(stored)
      setProfiles(parsed)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save(next: CustomProfileEntry[], msg: string): Promise<void> {
    const parsed = CustomProfilesStoreSchema.parse(next)
    await window.dh.storeSet({ key: 'custom_profiles', data: parsed })
    setProfiles(parsed)
    setStatus(msg)
  }

  async function removeAt(idx: number): Promise<void> {
    const next = profiles.filter((_, i) => i !== idx)
    await save(next, 'Profile removed.')
  }

  async function duplicateAt(idx: number): Promise<void> {
    const p = profiles[idx]
    if (!p) return
    const next = [...profiles, { ...p, name: `${p.name} Copy` }]
    await save(next, 'Profile duplicated.')
  }

  async function exportJson(): Promise<void> {
    const text = JSON.stringify(profiles, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Profiles JSON copied to clipboard.')
    } catch {
      setImportText(text)
      setStatus('Clipboard unavailable; JSON put in import box below.')
    }
  }

  async function importJson(): Promise<void> {
    try {
      const raw = JSON.parse(importText) as unknown
      const parsed = CustomProfilesStoreSchema.parse(raw)
      await save(parsed, 'Profiles imported.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const byTemplate = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of profiles) map.set(p.baseTemplate, (map.get(p.baseTemplate) ?? 0) + 1)
    return [...map.entries()]
  }, [profiles])

  return (
    <div style={{ maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          PROFILES
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Profile Manager</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 760 }}>
          Manage saved custom profiles used by Dashboard Main cards. Profiles are stored in your local userData JSON.
        </p>
      </header>

      <section style={card}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => void load()}>
            Refresh
          </button>
          <button type="button" style={btn} onClick={() => void exportJson()}>
            Export JSON
          </button>
          <button type="button" style={btnDanger} onClick={() => void save([], 'All profiles cleared.')}>
            Clear all
          </button>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {profiles.length} profiles
          </span>
        </div>
        {status ? <div style={{ marginTop: 10, color: 'var(--text-muted)' }}>{status}</div> : null}
      </section>

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Current profiles</div>
        {profiles.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>No custom profiles saved yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {profiles.map((p, i) => (
              <article key={`${p.name}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
                  base: {p.baseTemplate}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" style={btnSmall} onClick={() => void duplicateAt(i)}>
                    Duplicate
                  </button>
                  <button type="button" style={btnSmallDanger} onClick={() => void removeAt(i)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Import profiles JSON</div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='Paste JSON array like [{"name":"My AI","baseTemplate":"ai-ml"}]'
          style={{
            width: '100%',
            minHeight: 140,
            resize: 'vertical',
            background: '#0a0a0a',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        />
        <div style={{ marginTop: 8 }}>
          <button type="button" style={btn} onClick={() => void importJson()}>
            Import JSON
          </button>
        </div>
      </section>

      {byTemplate.length > 0 ? (
        <section style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>By base template</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {byTemplate.map(([k, n]) => (
              <li key={k} className="mono" style={{ marginBottom: 4 }}>
                {k}: {n}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

const card = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 14,
}

const btn = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
}

const btnDanger = {
  ...btn,
  color: 'var(--red)',
}

const btnSmall = {
  ...btn,
  padding: '5px 10px',
  fontSize: 12,
}

const btnSmallDanger = {
  ...btnSmall,
  color: 'var(--red)',
}
