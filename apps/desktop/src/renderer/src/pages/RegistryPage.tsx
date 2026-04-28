import type { GitRepoEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'

export function RegistryPage(): ReactElement {
  const [url, setUrl] = useState('https://github.com/octocat/Hello-World.git')
  const [target, setTarget] = useState('')
  const [recent, setRecent] = useState<GitRepoEntry[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [repoPath, setRepoPath] = useState('')
  const [gitInfo, setGitInfo] = useState<Record<string, unknown> | null>(null)

  const loadRecent = useCallback(async () => {
    const r = (await window.dh.gitRecentList()) as GitRepoEntry[]
    setRecent(r)
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  async function pickTarget(): Promise<void> {
    const dir = await window.dh.selectFolder()
    if (dir) setTarget(dir)
  }

  async function pickRepo(): Promise<void> {
    const dir = await window.dh.selectFolder()
    if (dir) setRepoPath(dir)
  }

  async function clone(): Promise<void> {
    if (!target.trim()) {
      setStatus('Choose a target directory with Browse.')
      return
    }
    setStatus('Cloning…')
    try {
      await window.dh.gitClone({ url, targetDir: target.trim() })
      setStatus('Clone complete')
      await loadRecent()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function inspect(): Promise<void> {
    if (!repoPath) return
    try {
      const s = (await window.dh.gitStatus({ repoPath })) as Record<string, unknown>
      setGitInfo(s)
      await window.dh.gitRecentAdd({ path: repoPath })
      await loadRecent()
    } catch (e) {
      setGitInfo({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <h1 style={{ marginTop: 0 }}>Registry &amp; Git</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Clone repositories into your home directory and track recently opened folders. Paths are
        validated in the main process.
      </p>

      <section style={{ ...section, marginTop: 24 }}>
        <label style={label}>
          Remote URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} style={input} />
        </label>
        <label style={label}>
          Target directory
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={target} readOnly placeholder="Select folder with Browse…" style={{ ...input, flex: 1 }} />
            <button type="button" onClick={() => void pickTarget()} style={btn}>
              Browse
            </button>
          </div>
        </label>
        <button type="button" onClick={() => void clone()} style={btnPrimary}>
          git clone
        </button>
        {status ? <div className="mono" style={{ fontSize: 13 }}>{status}</div> : null}
      </section>

      <section style={{ ...section, marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Inspect repository</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={repoPath} readOnly placeholder="Repository path" style={{ ...input, flex: 1 }} />
          <button type="button" onClick={() => void pickRepo()} style={btn}>
            Browse
          </button>
          <button type="button" onClick={() => void inspect()} style={btnPrimary}>
            Status
          </button>
        </div>
        {gitInfo ? (
          <pre
            className="mono"
            style={{ marginTop: 16, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}
          >
            {JSON.stringify(gitInfo, null, 2)}
          </pre>
        ) : null}
      </section>

      <section style={{ marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Recent repositories</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {recent.map((r) => (
            <li
              key={r.path}
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                marginBottom: 8,
                fontSize: 13,
              }}
            >
              <div className="mono">{r.path}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {new Date(r.lastOpened).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

const section: CSSProperties = {
  padding: 20,
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const label: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
}

const input: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 10px',
  color: 'var(--text)',
}

const btn: CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '8px 12px',
  cursor: 'pointer',
}

const btnPrimary: CSSProperties = {
  ...btn,
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
  color: '#0d0d0d',
  fontWeight: 600,
}
