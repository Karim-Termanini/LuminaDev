import type { GitRepoEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'
import { humanizeDockerError } from './dockerError'
import { assertGitRecentList } from './registryContract'

export function RegistryPage(): ReactElement {
  const [url, setUrl] = useState('https://github.com/octocat/Hello-World.git')
  const [target, setTarget] = useState('')
  const [recent, setRecent] = useState<GitRepoEntry[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [repoPath, setRepoPath] = useState('')
  const [gitInfo, setGitInfo] = useState<Record<string, unknown> | null>(null)

  // Docker Search State
  const [dockerTerm, setDockerTerm] = useState('')
  const [dockerResults, setDockerResults] = useState<Array<{ name: string; description: string; star_count: number; is_official: boolean }>>([])
  const [dockerLoading, setDockerLoading] = useState(false)

  const loadRecent = useCallback(async () => {
    try {
      const res = await window.dh.gitRecentList()
      setRecent(assertGitRecentList(res))
      setStatus(null)
    } catch (e) {
      setStatus(humanizeGitError(e))
      setRecent([])
    }
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
      const res = await window.dh.gitClone({ url, targetDir: target.trim() })
      assertGitOk(res, 'Git clone failed.')
      setStatus('Clone complete')
      await loadRecent()
    } catch (e) {
      setStatus(humanizeGitError(e))
    }
  }

  async function inspect(): Promise<void> {
    if (!repoPath) return
    try {
      const s = (await window.dh.gitStatus({ repoPath })) as { ok: boolean; info: Record<string, unknown>; error?: string }
      assertGitOk(s, 'Git status failed.')
      setGitInfo(s.info)
      const addRes = (await window.dh.gitRecentAdd({ path: repoPath })) as { ok: boolean; error?: string }
      assertGitOk(addRes, 'Failed to save recent repo.')
      await loadRecent()
    } catch (e) {
      setGitInfo({ error: humanizeGitError(e) })
    }
  }

  async function searchDocker(): Promise<void> {
    if (!dockerTerm.trim()) return
    setDockerLoading(true)
    setStatus(null)
    try {
      const res = await window.dh.dockerSearch(dockerTerm.trim())
      if (res.ok) {
        setDockerResults(res.results)
      } else {
        setStatus(humanizeDockerError(res.error))
      }
    } catch (e) {
      setStatus(humanizeDockerError(e))
    } finally {
      setDockerLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <header>
      <h1 style={{ marginTop: 0, marginBottom: 6 }}>Registry &amp; Git</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.5 }}>
        Manage your source control and container assets. Clone repositories or search for official
        Docker images directly from the Hub.
      </p>
      </header>
      {status ? (
        <div className="hp-status-alert warning" style={{ marginTop: -4 }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span>{status}</span>
        </div>
      ) : null}

      <section style={section}>
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
      </section>

      <section style={{ ...section, marginTop: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Docker Hub Search</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={dockerTerm}
            onChange={(e) => setDockerTerm(e.target.value)}
            placeholder="Search images (e.g. redis, postgres)…"
            style={{ ...input, flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && void searchDocker()}
          />
          <button type="button" onClick={() => void searchDocker()} style={btnPrimary} disabled={dockerLoading}>
            {dockerLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
        {dockerResults.length > 0 && (
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {dockerResults.slice(0, 6).map((r) => (
              <div
                key={r.name}
                style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {r.name}
                  {r.is_official && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        background: 'var(--accent)',
                        color: '#000',
                        padding: '1px 4px',
                        borderRadius: 4,
                        verticalAlign: 'middle',
                      }}
                    >
                      OFFICIAL
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginTop: 4,
                    height: 32,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.description}
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>★ {r.star_count}</span>
                  <button type="button" style={{ ...btnLink }} onClick={() => {
                    void window.dh.openExternal(`https://hub.docker.com/_/${r.name.includes('/') ? 'r/' + r.name : r.name}`)
                  }}>View Hub ↗</button>
                </div>
              </div>
            ))}
          </div>
        )}
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

      <section style={{ ...section, paddingTop: 14 }}>
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
  fontWeight: 600,
  transition: 'filter 120ms ease, transform 120ms ease',
}

const btnPrimary: CSSProperties = {
  ...btn,
  background: 'var(--accent)',
  borderColor: 'var(--accent)',
  color: '#0d0d0d',
  fontWeight: 600,
}

const btnLink: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  padding: 0,
  textDecoration: 'underline',
  textUnderlineOffset: 2,
}
