import type { ReactElement } from 'react'
import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CloudGitPage } from './CloudGitPage'
import { GitConfigPage } from './GitConfigPage'
import { GitVcsPage } from './GitVcsPage'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'

type GitTab = 'vcs' | 'config' | 'cloud'

const TABS: { id: GitTab; label: string; icon: string }[] = [
  { id: 'vcs', label: 'Version Control', icon: 'source-control' },
  { id: 'config', label: 'Git Config', icon: 'settings-gear' },
  { id: 'cloud', label: 'Cloud (GitHub / GitLab)', icon: 'github' },
]

export function DeveloperGitPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: GitTab = (() => {
    const raw = searchParams.get('tab')
    if (raw === 'config' || raw === 'cloud') return raw
    return 'vcs'
  })()

  function switchTab(t: GitTab): void {
    const next = new URLSearchParams(searchParams)
    next.set('tab', t)
    // preserve provider when going to cloud, clear on other tabs
    if (t !== 'cloud') next.delete('provider')
    setSearchParams(next, { replace: true })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '10px 20px 0',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          flexShrink: 0,
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'none',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                transition: 'color 120ms ease',
              }}
            >
              <span className={`codicon codicon-${t.icon}`} aria-hidden />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: activeTab === 'cloud' ? 'auto' : 'hidden' }}>
        {activeTab === 'vcs' && <VcsTabWrapper />}
        {activeTab === 'config' && <GitConfigPage />}
        {activeTab === 'cloud' && <CloudGitPage />}
      </div>
    </div>
  )
}

/** VCS tab: GitVcsPage + a small Clone section at the bottom. */
function VcsTabWrapper(): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <GitVcsPage />
      </div>
      <CloneBar />
    </div>
  )
}

function CloneBar(): ReactElement {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const run = useCallback(async () => {
    const u = url.trim()
    const t = target.trim()
    if (!u) return
    setBusy(true)
    setMsg(null)
    try {
      if (!t) { setMsg({ text: 'Enter a target directory.', ok: false }); setBusy(false); return }
      const res = await window.dh.gitClone({ url: u, targetDir: t })
      assertGitOk(res, 'Clone failed.')
      const clonedPath = (res as Record<string, unknown>).path as string | undefined
      setMsg({ text: 'Clone complete.', ok: true })
      setUrl('')
      setTarget('')
      if (clonedPath) {
        const p = new URLSearchParams({ tab: 'vcs', repoPath: clonedPath })
        navigate(`/git?${p.toString()}`, { replace: false })
      }
    } catch (e) {
      setMsg({ text: humanizeGitError(e), ok: false })
    } finally {
      setBusy(false)
    }
  }, [url, target, navigate])

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 16px',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>Clone</span>
      <input
        type="text"
        placeholder="Repository URL"
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
        style={{
          flex: '2 1 220px',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          color: 'var(--text)',
          fontSize: 12,
        }}
      />
      <input
        type="text"
        placeholder="Target directory"
        value={target}
        disabled={busy}
        onChange={(e) => setTarget(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void run() }}
        style={{
          flex: '1 1 160px',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--bg-input)',
          color: 'var(--text)',
          fontSize: 12,
        }}
      />
      <button
        type="button"
        className="hp-btn hp-btn-primary"
        disabled={busy || !url.trim() || !target.trim()}
        onClick={() => void run()}
        style={{ fontSize: 12, padding: '6px 14px' }}
      >
        {busy ? 'Cloning…' : 'Clone'}
      </button>
      {msg ? (
        <span style={{ fontSize: 11, color: msg.ok ? 'var(--green)' : 'var(--red)', flexBasis: '100%' }}>
          {msg.text}
        </span>
      ) : null}
    </div>
  )
}
