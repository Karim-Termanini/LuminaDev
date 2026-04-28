import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'

type Target = 'sandbox' | 'host'

type GitConfigRow = {
  key: string
  value: string
}

const SENSITIVE_KEYS = new Set([
  'user.password',
  'user.signingkey',
  'credential.helper',
  'http.proxy',
  'https.proxy',
  'core.askpass',
  'http.cookiefile',
  'http.extraheader',
])

export function GitConfigPage(): ReactElement {
  const [target, setTarget] = useState<Target>('sandbox')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('')
  const [defaultEditor, setDefaultEditor] = useState('')
  const [rows, setRows] = useState<GitConfigRow[]>([])
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'key' | 'value'>('key')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showSensitiveOnly, setShowSensitiveOnly] = useState(false)
  const [maskedKeys, setMaskedKeys] = useState<Set<string>>(
    () => new Set(SENSITIVE_KEYS)
  )

  const loadConfig = useCallback(async () => {
    setBusy(true)
    setStatus('')
    try {
      const res = (await window.dh.gitConfigList({ target })) as {
        ok: boolean
        rows: GitConfigRow[]
      }
      const nextRows = res.rows ?? []
      setRows(nextRows)
      const byKey = new Map(nextRows.map((r) => [r.key.toLowerCase(), r.value]))
      setName(byKey.get('user.name') ?? '')
      setEmail(byKey.get('user.email') ?? '')
      setDefaultBranch(byKey.get('init.defaultbranch') ?? '')
      setDefaultEditor(byKey.get('core.editor') ?? '')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
      setRows([])
    } finally {
      setBusy(false)
    }
  }, [target])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  async function applyConfig(): Promise<void> {
    if (!name.trim() || !email.trim()) {
      setStatus('Name and email are required.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      await window.dh.gitConfigSet({
        name: name.trim(),
        email: email.trim(),
        defaultBranch: defaultBranch.trim() || undefined,
        defaultEditor: defaultEditor.trim() || undefined,
        target,
      })
      setStatus('Git config saved.')
      await loadConfig()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function toggleMask(key: string): void {
    setMaskedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function isSensitive(key: string): boolean {
    return SENSITIVE_KEYS.has(key) || /password|secret|token|key$/i.test(key)
  }

  function maskValue(key: string, value: string): string {
    if (!maskedKeys.has(key) && isSensitive(key)) {
      if (value.length <= 4) return '●●●●'
      return value.slice(0, 2) + '●●●●' + value.slice(-2)
    }
    if (maskedKeys.has(key) && isSensitive(key)) return value
    return value
  }

  const filtered = rows
    .filter((r) => {
      if (showSensitiveOnly && !isSensitive(r.key)) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const valA = a[sortKey].toLowerCase()
      const valB = b[sortKey].toLowerCase()
      if (valA < valB) return sortDir === 'asc' ? -1 : 1
      if (valA > valB) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  function handleSort(key: 'key' | 'value'): void {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const statusTone =
    status.toLowerCase().includes('saved')
      ? 'success'
      : status
        ? 'warning'
        : 'idle'

  return (
    <div className="hp-page-stack">
      <header>
        <h1 className="hp-title">Git Configuration</h1>
        <p className="hp-muted">
          Set user identity and default settings, then review all global config entries.
        </p>
      </header>

      <section className="hp-card">
        <div className="hp-section-title">Target</div>
        <div className="hp-row-wrap">
          <button
            type="button"
            className={`hp-btn ${target === 'sandbox' ? 'hp-btn-primary' : ''}`}
            onClick={() => setTarget('sandbox')}
            disabled={busy}
          >
            Sandbox (Isolated)
          </button>
          <button
            type="button"
            className={`hp-btn ${target === 'host' ? 'hp-btn-primary' : ''}`}
            onClick={() => setTarget('host')}
            disabled={busy}
          >
            Host (Main System)
          </button>
        </div>
      </section>

      <section className="hp-card">
        <div className="hp-grid-2">
          <div>
            <div className="hp-section-title">User Identity</div>
            <div className="hp-grid-gap-8">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name (e.g. Jane Doe)"
                className="hp-input"
                disabled={busy}
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email (e.g. jane@example.com)"
                className="hp-input"
                disabled={busy}
              />
            </div>
          </div>
          <div>
            <div className="hp-section-title">Defaults</div>
            <div className="hp-grid-gap-8">
              <input
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                placeholder="Default branch (e.g. main)"
                className="hp-input"
                disabled={busy}
              />
              <div className="hp-row-wrap">
                <button type="button" className="hp-btn" onClick={() => setDefaultBranch('main')} disabled={busy}>
                  main
                </button>
                <button type="button" className="hp-btn" onClick={() => setDefaultBranch('master')} disabled={busy}>
                  master
                </button>
              </div>
              <input
                value={defaultEditor}
                onChange={(e) => setDefaultEditor(e.target.value)}
                placeholder="Default editor (e.g. code --wait, vim, nano)"
                className="hp-input"
                disabled={busy}
              />
              <div className="hp-row-wrap">
                <button type="button" className="hp-btn" onClick={() => setDefaultEditor('code --wait')} disabled={busy}>
                  VS Code
                </button>
                <button type="button" className="hp-btn" onClick={() => setDefaultEditor('vim')} disabled={busy}>
                  vim
                </button>
                <button type="button" className="hp-btn" onClick={() => setDefaultEditor('nano')} disabled={busy}>
                  nano
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="hp-card">
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          onClick={() => void applyConfig()}
          disabled={busy}
        >
          Apply Configuration
        </button>
      </section>

      <section className="hp-card">
        <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="hp-section-title" style={{ marginBottom: 0 }}>
            Global Config ({rows.length} entries)
          </div>
          <div className="hp-row-wrap">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter entries…"
              className="hp-input"
              style={{ width: 200 }}
              disabled={busy}
            />
            <button type="button" className="hp-btn" onClick={() => void loadConfig()} disabled={busy}>
              Refresh
            </button>
            <button
              type="button"
              className="hp-btn"
              onClick={() => setShowSensitiveOnly((v) => !v)}
              disabled={busy}
            >
              {showSensitiveOnly ? 'Show All' : 'Sensitive Only'}
            </button>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="hp-muted" style={{ fontSize: 13 }}>
            {rows.length === 0
              ? 'No global git config entries found. Run `git config --global --list` in a terminal to verify.'
              : 'No entries match your filter.'}
          </div>
        ) : (
          <div className="hp-table-wrap">
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head">
                  <th 
                    className="hp-table-sort"
                    style={{ width: '45%' }}
                    onClick={() => handleSort('key')}
                  >
                    Key {sortKey === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th 
                    className="hp-table-sort"
                    style={{ width: '45%' }}
                    onClick={() => handleSort('value')}
                  >
                    Value {sortKey === 'value' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: '8px 6px', width: '10%' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sensitive = isSensitive(r.key)
                  const masked = maskValue(r.key, r.value)
                  return (
                    <tr
                      key={r.key}
                      className="hp-table-row"
                    >
                      <td
                        className="mono"
                        style={{ padding: '9px 6px' }}
                      >
                        {r.key}
                      </td>
                      <td
                        className="mono"
                        style={{ padding: '9px 6px' }}
                      >
                        {masked}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                        {sensitive ? (
                          <button
                            type="button"
                            className="hp-btn"
                            onClick={() => toggleMask(r.key)}
                            title={
                              maskedKeys.has(r.key) && sensitive
                                ? 'Mask'
                                : 'Reveal'
                            }
                          >
                            {maskedKeys.has(r.key) && sensitive ? '👁' : '🙈'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {status ? (
        <div className={`hp-status-alert ${statusTone === 'success' ? 'success' : 'warning'}`}>
          <span style={{ fontSize: 18 }}>{statusTone === 'success' ? '✔' : '⚠'}</span>
          <span>{status}</span>
        </div>
      ) : null}
    </div>
  )
}