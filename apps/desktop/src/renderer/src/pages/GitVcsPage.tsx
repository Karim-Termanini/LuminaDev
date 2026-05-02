import type { BranchEntry, ConnectedAccount, FileEntry, GitRemoteEntry, GitRepoEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { assertGitOk } from './gitContract'
import { assertGitVcsOk } from './gitVcsContract'
import { humanizeGitVcsError, parseGitVcsErrorCode } from './gitVcsError'
import { GitVcsBranchPicker } from './gitVcsBranchPicker'
import { GitVcsCommitBar } from './gitVcsCommitBar'
import { GitVcsDiffPanel } from './gitVcsDiffPanel'
import { GitVcsFileList } from './gitVcsFileList'
import { parseCheckoutDirtyFileList } from './gitVcsCheckoutDirty'
import { GitVcsDirtyCheckoutModal } from './GitVcsDirtyCheckoutModal'
import { GitVcsProviderRail } from './gitVcsProviderRail'
import { GitVcsRepoPicker } from './gitVcsRepoPicker'
import { assertGitRecentList } from './registryContract'
import { CLOUD_GIT_PROVIDER_THEME } from './cloudGitTheme'
import { fetchRemoteOptions } from './gitVcsFetchRemotes'
import { classifyGitRemoteUrl } from './gitVcsProviderHost'
import { reconcileGitVcsSelection } from './gitVcsSelection'

const GLASS = {
  background: 'rgba(30, 30, 30, 0.45)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
} as const

type DirtyCheckoutPrompt = { branch: string; create: boolean; files: string[] }

export function GitVcsPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const [recents, setRecents] = useState<GitRepoEntry[]>([])
  const [repoPath, setRepoPath] = useState('')
  const [branch, setBranch] = useState('')
  const [ahead, setAhead] = useState<number | null>(null)
  const [behind, setBehind] = useState<number | null>(null)
  const [staged, setStaged] = useState<FileEntry[]>([])
  const [unstaged, setUnstaged] = useState<FileEntry[]>([])
  const [branches, setBranches] = useState<BranchEntry[]>([])
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null)
  const [diffText, setDiffText] = useState<string | null>(null)
  const [diffBinary, setDiffBinary] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [busy, setBusy] = useState(false)
  /** Raw IPC error string (may include `[GIT_VCS_*]` prefix) for humanizer + code detection. */
  const [opErrorRaw, setOpErrorRaw] = useState<string | null>(null)
  /** Modal: checkout blocked by dirty worktree (target branch + parsed paths). */
  const [dirtyCheckout, setDirtyCheckout] = useState<DirtyCheckoutPrompt | null>(null)
  const [stashIncludeUntracked, setStashIncludeUntracked] = useState(true)
  const [fetchRemote, setFetchRemote] = useState('origin')
  const [gitRemotes, setGitRemotes] = useState<GitRemoteEntry[]>([])
  const [cloudAccounts, setCloudAccounts] = useState<ConnectedAccount[]>([])

  const fetchRemoteNames = useMemo(() => fetchRemoteOptions(branches), [branches])
  const activeFetchRemoteName = fetchRemoteNames.includes(fetchRemote)
    ? fetchRemote
    : (fetchRemoteNames[0] ?? 'origin')

  const closeDirtyCheckoutModal = useCallback(() => setDirtyCheckout(null), [])

  useEffect(() => {
    void window.dh.cloudAuthStatus().then((res) => {
      if (res.ok && Array.isArray(res.accounts)) setCloudAccounts(res.accounts as ConnectedAccount[])
      else setCloudAccounts([])
    })
  }, [])

  const loadRecents = useCallback(async () => {
    try {
      const res = await window.dh.gitRecentList()
      setRecents(assertGitRecentList(res))
    } catch {
      setRecents([])
    }
  }, [])

  const persistRepoChoice = useCallback(
    async (next: string): Promise<void> => {
      setRepoPath(next)
      setSelected(null)
      setOpErrorRaw(null)
      closeDirtyCheckoutModal()
      if (!next.trim()) return
      try {
        const add = await window.dh.gitRecentAdd({ path: next.trim() })
        assertGitOk(add, 'Could not add repo to recents.')
        await loadRecents()
      } catch {
        /* recents best-effort */
      }
    },
    [closeDirtyCheckoutModal, loadRecents],
  )

  useEffect(() => {
    void loadRecents()
  }, [loadRecents])

  useEffect(() => {
    if (repoPath) return
    if (recents.length === 0) return
    const top = [...recents].sort((a, b) => b.lastOpened - a.lastOpened)[0]
    if (top?.path) setRepoPath(top.path)
  }, [recents, repoPath])

  useEffect(() => {
    const qRepo = searchParams.get('repoPath')?.trim()
    if (!qRepo) return
    if (qRepo === repoPath.trim()) return
    void persistRepoChoice(qRepo)
    const next = new URLSearchParams(searchParams)
    next.delete('repoPath')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, repoPath, persistRepoChoice])

  const refreshStatus = useCallback(async (): Promise<{ staged: FileEntry[]; unstaged: FileEntry[] }> => {
    if (!repoPath.trim()) {
      setBranch('')
      setAhead(null)
      setBehind(null)
      setStaged([])
      setUnstaged([])
      setBranches([])
      setGitRemotes([])
      return { staged: [], unstaged: [] }
    }
    const path = repoPath.trim()
    const [st, br, rm] = await Promise.all([
      window.dh.gitVcsStatus({ repoPath: path }),
      window.dh.gitVcsBranches({ repoPath: path }),
      window.dh.gitVcsRemotes({ repoPath: path }),
    ])
    assertGitVcsOk(st)
    setBranch(st.branch ?? '')
    setAhead(st.ahead ?? null)
    setBehind(st.behind ?? null)
    const stagedArr = Array.isArray(st.staged) ? (st.staged as FileEntry[]) : []
    const unstagedArr = Array.isArray(st.unstaged) ? (st.unstaged as FileEntry[]) : []
    setStaged(stagedArr)
    setUnstaged(unstagedArr)

    assertGitVcsOk(br)
    setBranches(Array.isArray(br.branches) ? (br.branches as BranchEntry[]) : [])

    if (rm.ok === true && Array.isArray(rm.remotes)) {
      setGitRemotes(rm.remotes as GitRemoteEntry[])
    } else {
      setGitRemotes([])
    }

    return { staged: stagedArr, unstaged: unstagedArr }
  }, [repoPath])

  useEffect(() => {
    void (async () => {
      if (!repoPath.trim()) return
      setOpErrorRaw(null)
      setBusy(true)
      try {
        const lists = await refreshStatus()
        setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
      } catch (e) {
        setOpErrorRaw(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    })()
  }, [repoPath, refreshStatus])

  useEffect(() => {
    setFetchRemote((cur) => (fetchRemoteNames.includes(cur) ? cur : fetchRemoteNames[0] ?? 'origin'))
  }, [repoPath, fetchRemoteNames])

  useEffect(() => {
    if (!repoPath.trim()) setGitRemotes([])
  }, [repoPath])

  const loadDiff = useCallback(
    async (path: string, isStaged: boolean): Promise<void> => {
      if (!repoPath.trim()) return
      setDiffText(null)
      setDiffBinary(false)
      try {
        const d = await window.dh.gitVcsDiff({
          repoPath: repoPath.trim(),
          filePath: path,
          staged: isStaged,
        })
        assertGitVcsOk(d)
        setOpErrorRaw(null)
        if (d.binary) {
          setDiffBinary(true)
          setDiffText(null)
        } else {
          setDiffBinary(false)
          setDiffText(typeof d.diff === 'string' ? d.diff : '')
        }
      } catch (e) {
        setOpErrorRaw(e instanceof Error ? e.message : String(e))
        setDiffText(null)
        setDiffBinary(false)
      }
    },
    [repoPath],
  )

  useEffect(() => {
    if (!selected) {
      setDiffText(null)
      setDiffBinary(false)
      return
    }
    void loadDiff(selected.path, selected.staged)
  }, [selected, loadDiff])

  async function openFolder(): Promise<void> {
    const dir = await window.dh.selectFolder()
    if (!dir) return
    await persistRepoChoice(dir)
  }

  async function runStage(paths: string[]): Promise<void> {
    if (!repoPath.trim() || paths.length === 0) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsStage({ repoPath: repoPath.trim(), filePaths: paths })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runUnstage(paths: string[]): Promise<void> {
    if (!repoPath.trim() || paths.length === 0) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsUnstage({ repoPath: repoPath.trim(), filePaths: paths })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runCommit(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsCommit({ repoPath: repoPath.trim(), message: commitMessage.trim() })
      assertGitVcsOk(r)
      setCommitMessage('')
      await refreshStatus()
      setSelected(null)
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runPull(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsPull({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runFetch(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsFetch({
        repoPath: repoPath.trim(),
        remote: activeFetchRemoteName,
      })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runPush(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsPush({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runCheckout(name: string): Promise<void> {
    if (!repoPath.trim() || !name) return
    setBusy(true)
    setOpErrorRaw(null)
    closeDirtyCheckoutModal()
    try {
      const r = await window.dh.gitVcsCheckout({ repoPath: repoPath.trim(), branch: name, create: false })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      if (parseGitVcsErrorCode(new Error(raw)) === 'GIT_VCS_CHECKOUT_DIRTY') {
        setStashIncludeUntracked(true)
        setDirtyCheckout({
          branch: name,
          create: false,
          files: parseCheckoutDirtyFileList(raw),
        })
        setOpErrorRaw(null)
      } else {
        setOpErrorRaw(raw)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runCreateBranch(name: string): Promise<void> {
    if (!repoPath.trim() || !name.trim()) return
    const trimmed = name.trim()
    setBusy(true)
    setOpErrorRaw(null)
    closeDirtyCheckoutModal()
    try {
      const r = await window.dh.gitVcsCheckout({
        repoPath: repoPath.trim(),
        branch: trimmed,
        create: true,
      })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      if (parseGitVcsErrorCode(new Error(raw)) === 'GIT_VCS_CHECKOUT_DIRTY') {
        setStashIncludeUntracked(true)
        setDirtyCheckout({
          branch: trimmed,
          create: true,
          files: parseCheckoutDirtyFileList(raw),
        })
        setOpErrorRaw(null)
      } else {
        setOpErrorRaw(raw)
      }
    } finally {
      setBusy(false)
    }
  }

  async function runStashAndRetryBranch(): Promise<void> {
    const target = dirtyCheckout
    if (!repoPath.trim() || !target) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const stash = await window.dh.gitVcsStash({
        repoPath: repoPath.trim(),
        message: `LuminaDev: before checkout ${target.branch}`,
        includeUntracked: stashIncludeUntracked,
      })
      assertGitVcsOk(stash)
      const r = await window.dh.gitVcsCheckout({
        repoPath: repoPath.trim(),
        branch: target.branch,
        create: target.create,
      })
      assertGitVcsOk(r)
      closeDirtyCheckoutModal()
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      closeDirtyCheckoutModal()
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const errCode = opErrorRaw ? parseGitVcsErrorCode(new Error(opErrorRaw)) : null
  const authBanner = errCode === 'GIT_VCS_AUTH_FAILED'
  const opErrorDisplay = opErrorRaw ? humanizeGitVcsError(new Error(opErrorRaw)) : null
  const activeFetchRemoteUrl = gitRemotes.find((r) => r.name === activeFetchRemoteName)?.fetchUrl
  const activeFetchProvider = activeFetchRemoteUrl ? classifyGitRemoteUrl(activeFetchRemoteUrl) : 'other'
  const vcsTheme = activeFetchProvider === 'other' ? null : CLOUD_GIT_PROVIDER_THEME[activeFetchProvider]
  const vcsScopedStyle = vcsTheme
    ? ({
        '--cg-accent': vcsTheme.accent,
        '--cg-accent-muted': vcsTheme.accentMuted,
        '--cg-surface': vcsTheme.surface,
        '--cg-surface-deep': vcsTheme.surfaceDeep,
      } as CSSProperties)
    : undefined

  const emptyRepo = !repoPath.trim()

  if (emptyRepo && recents.length === 0) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '24px 16px', ...vcsScopedStyle }}>
        <header style={{ marginBottom: 28 }}>
          <div className="mono" style={{ color: 'var(--cg-accent, var(--accent))', fontSize: 12, marginBottom: 8 }}>
            GIT.WORKTREE
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Git VCS</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 640, lineHeight: 1.5 }}>
            Stage, review diffs, commit, and sync branches — all against your local Git checkout.
          </p>
        </header>
        <GitVcsProviderRail
          accounts={cloudAccounts}
          remotes={gitRemotes}
          activeFetchRemote={activeFetchRemoteName}
          hasRepo={false}
        />
        <div
          style={{
            ...GLASS,
            borderRadius: 20,
            padding: '48px 32px',
            textAlign: 'center',
            maxWidth: 520,
            margin: '0 auto',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.85 }} aria-hidden>
            <span className="codicon codicon-git-branch" />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600 }}>Pick a repository to start</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.55, marginBottom: 24 }}>
            Open any local Git folder. Recently opened repos will appear in the picker for quick access.
          </p>
          <button type="button" className="hp-btn hp-btn-primary" onClick={() => void openFolder()}>
            Open folder…
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '20px 16px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...vcsScopedStyle,
      }}
    >
      <header>
        <div className="mono" style={{ color: 'var(--cg-accent, var(--accent))', fontSize: 12, marginBottom: 6 }}>
          GIT.WORKTREE
        </div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Git VCS</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 6, maxWidth: 720, lineHeight: 1.5 }}>
          Status, diffs, stage, commit, fetch, pull, and push. HTTPS remotes use credentials from{' '}
          <Link to="/cloud-git?tab=github" style={{ color: 'var(--cg-accent, var(--accent))' }}>
            Cloud Git
          </Link>
          .
        </p>
      </header>

      <GitVcsProviderRail
        accounts={cloudAccounts}
        remotes={gitRemotes}
        activeFetchRemote={activeFetchRemoteName}
        hasRepo={!!repoPath.trim()}
      />

      <GitVcsRepoPicker
        value={repoPath}
        onChange={(p) => void persistRepoChoice(p)}
        recents={recents}
        onOpenFolder={() => void openFolder()}
        highlightPath={null}
      />

      {opErrorDisplay ? (
        <div
          role="alert"
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid rgba(255, 82, 82, 0.35)',
            background: 'rgba(255, 82, 82, 0.08)',
            color: 'var(--text)',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span>{opErrorDisplay}</span>
          {authBanner ? (
            <Link to="/cloud-git?tab=github" className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
              Connect in Cloud Git
            </Link>
          ) : null}
        </div>
      ) : null}

      {!repoPath.trim() ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Choose a repository above.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <GitVcsBranchPicker
              branches={branches}
              currentBranch={branch}
              busy={busy}
              onCheckout={(n) => void runCheckout(n)}
              onCreateBranch={(n) => void runCreateBranch(n)}
            />
            <div style={{ flex: 1 }} />
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {ahead != null && ahead > 0 ? `↑${ahead} ` : null}
              {behind != null && behind > 0 ? `↓${behind}` : null}
              {ahead != null &&
              behind != null &&
              ahead === 0 &&
              behind === 0
                ? 'up to date with upstream'
                : null}
              {ahead == null && behind == null ? 'no upstream tracking' : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <select
                className="mono"
                aria-label="Remote to fetch"
                value={activeFetchRemoteName}
                disabled={busy}
                onChange={(e) => setFetchRemote(e.target.value)}
                style={{
                  minWidth: 100,
                  maxWidth: 160,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-panel)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                {fetchRemoteNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button type="button" className="hp-btn" disabled={busy} onClick={() => void runFetch()}>
                Fetch
              </button>
            </div>
            <button type="button" className="hp-btn" disabled={busy} onClick={() => void runPull()}>
              Pull
            </button>
            <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void runPush()}>
              Push
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 34%) 1fr', gap: 16, minHeight: 360 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 12,
                background: 'var(--bg-panel)',
                overflow: 'auto',
              }}
            >
              <GitVcsFileList
                staged={staged}
                unstaged={unstaged}
                selected={selected}
                busy={busy}
                onSelect={(path, st) => setSelected({ path, staged: st })}
                onStage={(paths) => void runStage(paths)}
                onUnstage={(paths) => void runUnstage(paths)}
              />
            </div>
            <GitVcsDiffPanel
              fileLabel={selected ? `${selected.path}${selected.staged ? ' (staged)' : ''}` : null}
              diff={diffText}
              binary={diffBinary}
            />
          </div>

          <GitVcsCommitBar
            message={commitMessage}
            onMessageChange={setCommitMessage}
            onCommit={() => void runCommit()}
            busy={busy}
            disabled={staged.length === 0}
          />
        </>
      )}

      <GitVcsDirtyCheckoutModal
        open={dirtyCheckout !== null}
        targetBranch={dirtyCheckout?.branch ?? ''}
        creatingNewBranch={dirtyCheckout?.create ?? false}
        files={dirtyCheckout?.files ?? []}
        includeUntracked={stashIncludeUntracked}
        onIncludeUntrackedChange={setStashIncludeUntracked}
        busy={busy}
        onCancel={closeDirtyCheckoutModal}
        onStashAndSwitch={() => void runStashAndRetryBranch()}
      />
    </div>
  )
}
