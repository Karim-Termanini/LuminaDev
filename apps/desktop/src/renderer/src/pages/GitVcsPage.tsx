import type { BranchEntry, ConnectedAccount, FileEntry, GitRemoteEntry, GitRepoEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { assertGitOk } from './gitContract'
import { assertGitVcsOk } from './gitVcsContract'
import { humanizeGitVcsError, parseGitVcsErrorCode } from './gitVcsError'
import { GitVcsBranchPicker } from './gitVcsBranchPicker'
import { GitVcsCiChecks } from './GitVcsCiChecks'
import { GitVcsCommitBar } from './gitVcsCommitBar'
import { GitVcsIntegrateWizardModal } from './GitVcsIntegrateWizardModal'
import { GitVcsRepoPipelines } from './gitVcsRepoPipelines'
import { GitVcsDiffPanel } from './gitVcsDiffPanel'
import { GitVcsFileList } from './gitVcsFileList'
import { GitVcsPrWizard } from './gitVcsPrWizard'
import { GitVcsConflictWizardModal } from './GitVcsConflictWizardModal'
import { parseCheckoutDirtyFileList } from './gitVcsCheckoutDirty'
import { GitVcsDirtyCheckoutModal } from './GitVcsDirtyCheckoutModal'
import { GitVcsProviderRail } from './gitVcsProviderRail'
import { GitVcsRepoPicker } from './gitVcsRepoPicker'
import { GitVcsStateBanner, type GitVcsOperation } from './GitVcsStateBanner'
import { assertGitRecentList } from './registryContract'
import { CLOUD_GIT_PROVIDER_THEME } from './cloudGitTheme'
import { fetchRemoteOptions } from './gitVcsFetchRemotes'
import { classifyGitRemoteUrl, resolvePipelineProvider } from './gitVcsProviderHost'
import { reconcileGitVcsSelection } from './gitVcsSelection'
import { GLASS } from '../layout/GLASS'

type DirtyCheckoutPrompt = { branch: string; create: boolean; files: string[] }

export function GitVcsPage(): ReactElement {
  const navigate = useNavigate()
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
  /** Transient feedback after "Copy raw error" on the Git op error panel. */
  const [rawErrorCopyHint, setRawErrorCopyHint] = useState<'idle' | 'copied' | 'failed'>('idle')
  /** Modal: checkout blocked by dirty worktree (target branch + parsed paths). */
  const [dirtyCheckout, setDirtyCheckout] = useState<DirtyCheckoutPrompt | null>(null)
  const [stashIncludeUntracked, setStashIncludeUntracked] = useState(true)
  const [fetchRemote, setFetchRemote] = useState('origin')
  const [gitRemotes, setGitRemotes] = useState<GitRemoteEntry[]>([])
  const [cloudAccounts, setCloudAccounts] = useState<ConnectedAccount[]>([])
  const [gitOperation, setGitOperation] = useState<GitVcsOperation>('none')
  const [conflictFileCount, setConflictFileCount] = useState(0)
  const [conflictWizardOpen, setConflictWizardOpen] = useState(false)
  const [integrateWizardOpen, setIntegrateWizardOpen] = useState(false)
  const [suggestedIntegrateTarget, setSuggestedIntegrateTarget] = useState('')
  const [conflictedFiles, setConflictedFiles] = useState<string[]>([])
  const [prWizardOpen, setPrWizardOpen] = useState(false)
  const [trackingPr, setTrackingPr] = useState<{ url: string; reference: string; provider: 'github' | 'gitlab' } | null>(null)
  const [lastCreatedPrUrl, setLastCreatedPrUrl] = useState<string | null>(null)
  /** When fetch remote host is unknown and both Cloud accounts exist, user picks which token scopes repo CI. */
  const [ambiguousCiToken, setAmbiguousCiToken] = useState<'github' | 'gitlab'>('github')
  const [softSuccessNotice, setSoftSuccessNotice] = useState<string | null>(null)

  const fetchRemoteNames = useMemo(() => fetchRemoteOptions(branches), [branches])
  const activeFetchRemoteName = fetchRemoteNames.includes(fetchRemote)
    ? fetchRemote
    : (fetchRemoteNames[0] ?? 'origin')

  const handleResolveRemoteConflicts = async (targetBase: string) => {
    console.log('[GitVcs] ResolveRemoteConflicts triggered for base:', targetBase)
    setBusy(true)
    try {
      // Ensure we have the latest remote info before showing the wizard
      await window.dh.gitVcsFetch({ repoPath: repoPath.trim(), remote: activeFetchRemoteName })
      const remoteRef = `${activeFetchRemoteName}/${targetBase}`
      setSuggestedIntegrateTarget(remoteRef)
      setIntegrateWizardOpen(true)
    } catch (e) {
      setOpErrorRaw(String(e))
    } finally {
      setBusy(false)
    }
  }

  const activateGitProvider = useCallback(
    (provider: 'github' | 'gitlab') => {
      const candidates = gitRemotes.filter((r) => classifyGitRemoteUrl(r.fetchUrl) === provider)
      if (candidates.length === 0) {
        void navigate(`/cloud-git?tab=${provider}`)
        return
      }
      const pick = candidates.find((r) => r.name === 'origin') ?? candidates[0]
      setFetchRemote(pick.name)
    },
    [gitRemotes, navigate, setFetchRemote],
  )

  const closeDirtyCheckoutModal = useCallback(() => setDirtyCheckout(null), [])

  useEffect(() => {
    setRawErrorCopyHint('idle')
  }, [opErrorRaw])

  const copyRawGitError = useCallback(async () => {
    if (!opErrorRaw?.trim()) return
    try {
      await navigator.clipboard.writeText(opErrorRaw)
      setRawErrorCopyHint('copied')
    } catch {
      setRawErrorCopyHint('failed')
    }
    window.setTimeout(() => {
      setRawErrorCopyHint('idle')
    }, 2500)
  }, [opErrorRaw])

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
      setGitOperation('none')
      setConflictFileCount(0)
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
    const opRaw = (st as { gitOperation?: unknown }).gitOperation
    const op: GitVcsOperation =
      opRaw === 'merging' || opRaw === 'rebasing' || opRaw === 'none' ? opRaw : 'none'
    setGitOperation(op)
    const n = Number((st as { conflictFileCount?: unknown }).conflictFileCount)
    setConflictFileCount(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0)
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
      // Drop last repo snapshot immediately so a failed refresh never shows stale branch/files
      // alongside e.g. `[GIT_VCS_NOT_A_REPO]` (would make Commit look broken).
      setBranch('')
      setAhead(null)
      setBehind(null)
      setStaged([])
      setUnstaged([])
      setBranches([])
      setGitRemotes([])
      setGitOperation('none')
      setConflictFileCount(0)
      setConflictedFiles([])
      setSelected(null)
      try {
        const lists = await refreshStatus()
        
        // Extract conflicted files (status === 'C')
        const conflicts = [
          ...lists.staged.filter(f => f.status === 'C').map(f => f.path),
          ...lists.unstaged.filter(f => f.status === 'C').map(f => f.path),
        ]
        
        setConflictedFiles(conflicts)
        setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
      } catch (e) {
        setOpErrorRaw(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    })()
  }, [repoPath, refreshStatus])

  // Persistence: Load tracking PR from store
  useEffect(() => {
    if (!repoPath.trim() || !branch) return
    const key = `vcs_pr_tracking_${repoPath.trim()}_${branch}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.dh.storeGet({ key: key as any }).then((res) => {
      if (res.ok && res.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTrackingPr(res.data as any)
      } else {
        setTrackingPr(null)
      }
    })
  }, [repoPath, branch])

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
      // Like VS Code "Git: Smart Commit" — if nothing is staged but there are local changes, stage all then commit.
      if (staged.length === 0 && unstaged.length > 0) {
        const rStage = await window.dh.gitVcsStage({
          repoPath: repoPath.trim(),
          filePaths: unstaged.map((f) => f.path),
        })
        assertGitVcsOk(rStage)
        const lists = await refreshStatus()
        setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
        if (lists.staged.length === 0) {
          throw new Error('[GIT_VCS_NO_STAGED] ')
        }
      } else if (staged.length === 0) {
        throw new Error('[GIT_VCS_NO_STAGED] ')
      }
      const r = await window.dh.gitVcsCommit({ repoPath: repoPath.trim(), message: commitMessage.trim() })
      assertGitVcsOk(r)
      setCommitMessage('')
      await refreshStatus()
      setSelected(null)
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
      try {
        const lists = await refreshStatus()
        setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
      } catch {
        /* ignore secondary refresh errors */
      }
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
    const path = repoPath.trim()
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const fetchRes = await window.dh.gitVcsFetch({
        repoPath: path,
        remote: activeFetchRemoteName,
      })
      assertGitVcsOk(fetchRes)
      const st = await window.dh.gitVcsStatus({ repoPath: path })
      assertGitVcsOk(st)
      const behind = st.behind
      if (behind != null && behind > 0) {
        setOpErrorRaw(
          `[GIT_VCS_INTEGRATION_REQUIRED] Remote "${activeFetchRemoteName}" has ${behind} commit(s) not in your branch yet.`,
        )
        const lists = await refreshStatus()
        setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
        return
      }
      const r = await window.dh.gitVcsPush({ repoPath: path })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      const code = parseGitVcsErrorCode(e)
      if (code === 'GIT_VCS_PROTECTED_BRANCH') {
        // Smart Flow: Suggest creating a new branch if current is main/master
        if (branch === 'main' || branch === 'master') {
          const suggestedName = `feature/work-${Math.floor(Math.random() * 1000)}`
          if (confirm(`This branch is protected. Would you like to move your local commits to a new branch "${suggestedName}" and open a Pull Request?`)) {
            void (async () => {
              setBusy(true)
              try {
                // 1. Create and switch to new branch (keeping local commits)
                const res = await window.dh.gitVcsCheckout({ repoPath: path, branch: suggestedName, create: true })
                assertGitVcsOk(res)
                
                // 2. Push the new branch
                const pushRes = await window.dh.gitVcsPush({ repoPath: path })
                assertGitVcsOk(pushRes)
                
                // 3. Open PR Wizard
                setPrWizardOpen(true)
                setOpErrorRaw(null)
              } catch (inner) {
                setOpErrorRaw(inner instanceof Error ? inner.message : String(inner))
              } finally {
                setBusy(false)
                await refreshStatus()
              }
            })()
          }
        } else {
          setPrWizardOpen(true)
          setOpErrorRaw(null)
        }
      } else {
        setOpErrorRaw(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  async function runForcePush(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsPush({ repoPath: repoPath.trim(), forceWithLease: true })
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

  async function runRenameBranch(oldName: string, newName: string): Promise<void> {
    if (!repoPath.trim() || !oldName || !newName) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsRenameBranch({ repoPath: repoPath.trim(), oldName, newName })
      assertGitVcsOk(r)
      await refreshStatus()
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runStashPop(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsStashPop({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runMergeContinue(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsMergeContinue({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runRebaseContinue(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsRebaseContinue({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // Truly unused functions removed

  async function runMergeAbort(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsMergeAbort({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runRebaseAbort(): Promise<void> {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsRebaseAbort({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      const lists = await refreshStatus()
      setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
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
  const integrationNotice = errCode === 'GIT_VCS_INTEGRATION_REQUIRED'
  const protectedBranchNotice = errCode === 'GIT_VCS_PROTECTED_BRANCH'
  const pushRejectedNotice = errCode === 'GIT_VCS_PUSH_REJECTED'
  const softGitNotice = integrationNotice || protectedBranchNotice || pushRejectedNotice
  const opErrorDisplay = opErrorRaw ? humanizeGitVcsError(new Error(opErrorRaw)) : null
  const activeFetchRemoteUrl = gitRemotes.find((r) => r.name === activeFetchRemoteName)?.fetchUrl
  const activeFetchProvider = activeFetchRemoteUrl ? classifyGitRemoteUrl(activeFetchRemoteUrl) : 'other'
  const cloudGitTabForRemote = activeFetchProvider === 'gitlab' ? 'gitlab' : 'github'
  const ghLinked = useMemo(() => cloudAccounts.some((a) => a.provider === 'github'), [cloudAccounts])
  const glLinked = useMemo(() => cloudAccounts.some((a) => a.provider === 'gitlab'), [cloudAccounts])
  const ambiguousPipelineHost =
    !!activeFetchRemoteUrl && activeFetchProvider === 'other' && ghLinked && glLinked

  useEffect(() => {
    setAmbiguousCiToken('github')
  }, [activeFetchRemoteName, activeFetchRemoteUrl, repoPath])

  const activeFetchPipelineProvider = useMemo(() => {
    if (!activeFetchRemoteUrl) return 'other' as const
    if (ambiguousPipelineHost) return ambiguousCiToken
    return resolvePipelineProvider(activeFetchRemoteUrl, cloudAccounts)
  }, [activeFetchRemoteUrl, cloudAccounts, ambiguousPipelineHost, ambiguousCiToken])
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
          onActivateProvider={activateGitProvider}
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
          Status, diffs, stage, commit, fetch, pull, push, merge, rebase, and stash pop. HTTPS remotes use credentials from{' '}
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
        onActivateProvider={activateGitProvider}
      />

      <GitVcsRepoPicker
        value={repoPath}
        onChange={(p) => void persistRepoChoice(p)}
        recents={recents}
        onOpenFolder={() => void openFolder()}
        highlightPath={null}
      />

      {repoPath.trim() ? (
        <GitVcsStateBanner operation={gitOperation} conflictFileCount={conflictFileCount} />
      ) : null}

      {trackingPr && activeFetchPipelineProvider !== 'other' && (
        <GitVcsCiChecks
          provider={activeFetchPipelineProvider as 'github' | 'gitlab'}
          repoPath={repoPath.trim()}
          remote={activeFetchRemoteName}
          reference={trackingPr.reference}
          prUrl={trackingPr.url}
          onResolveConflicts={handleResolveRemoteConflicts}
          onClose={() => {
            setTrackingPr(null)
            const key = `vcs_pr_tracking_${repoPath.trim()}_${branch}`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            void window.dh.storeDelete({ key: key as any })
          }}
        />
      )}

      {opErrorDisplay ? (
        <div
          role={softGitNotice ? 'status' : 'alert'}
          style={{
            padding: '12px 14px',
            borderRadius: 10,
            border: softGitNotice
              ? '1px solid rgba(255, 183, 77, 0.45)'
              : '1px solid rgba(255, 82, 82, 0.35)',
            background: softGitNotice
              ? 'linear-gradient(90deg, rgba(255, 183, 77, 0.14) 0%, rgba(255, 138, 128, 0.06) 100%)'
              : 'rgba(255, 82, 82, 0.08)',
            color: 'var(--text)',
            fontSize: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span>{opErrorDisplay}</span>
          {integrationNotice ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void runPull()}>
                Pull latest
              </button>
              <button type="button" className="hp-btn" disabled={busy} onClick={() => void runFetch()}>
                Fetch only
              </button>
              <button type="button" className="hp-btn" onClick={() => setOpErrorRaw(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {pushRejectedNotice ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                disabled={busy}
                onClick={() => void runForcePush()}
              >
                Force push (--force-with-lease)
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Safe after rebase — fails if someone else pushed since your last fetch.
              </span>
              <button type="button" className="hp-btn" onClick={() => setOpErrorRaw(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {protectedBranchNotice ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <Link
                to={`/cloud-git?tab=${cloudGitTabForRemote}`}
                className="hp-btn hp-btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Open Cloud Git
              </Link>
              {activeFetchProvider === 'other' ? (
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Pick GitHub or GitLab tab if the default host is wrong for this remote.
                </span>
              ) : null}
              <button type="button" className="hp-btn" onClick={() => setOpErrorRaw(null)}>
                Dismiss
              </button>
            </div>
          ) : null}
          {authBanner ? (
            <Link to="/cloud-git?tab=github" className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
              Connect in Cloud Git
            </Link>
          ) : null}
          {opErrorRaw?.trim() ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="hp-btn"
                aria-label="Copy full error text, including Git error code prefix"
                onClick={() => void copyRawGitError()}
              >
                Copy raw error
              </button>
              {rawErrorCopyHint === 'copied' ? (
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }} aria-live="polite">
                  Copied
                </span>
              ) : null}
              {rawErrorCopyHint === 'failed' ? (
                <span className="mono" style={{ fontSize: 12, color: '#ff8a80' }} aria-live="polite">
                  Clipboard unavailable
                </span>
              ) : null}
              {!integrationNotice && !protectedBranchNotice ? (
                <button type="button" className="hp-btn" onClick={() => setOpErrorRaw(null)}>
                  Dismiss
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!repoPath.trim() ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Choose a repository above.</div>
      ) : (
        <>
          {/* Single action bar: branch | status | remote | Fetch Pull Push */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'rgba(20, 20, 24, 0.35)',
              flexWrap: 'wrap',
            }}
          >
            <GitVcsBranchPicker
              branches={branches}
              currentBranch={branch}
              busy={busy}
              onCheckout={(n) => void runCheckout(n)}
              onCreateBranch={(n) => void runCreateBranch(n)}
              onRenameBranch={(old, next) => void runRenameBranch(old, next)}
            />
            <div style={{ flex: 1, minWidth: 8 }} />
            {/* ahead/behind pill */}
            {ahead != null || behind != null ? (
              <span
                className="mono"
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: '3px 10px',
                  whiteSpace: 'nowrap',
                }}
              >
                {ahead != null && ahead > 0 ? `↑${ahead} ` : ''}
                {behind != null && behind > 0 ? `↓${behind}` : ''}
                {ahead === 0 && behind === 0 ? 'up to date' : ''}
              </span>
            ) : (
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)', opacity: 0.6 }}>
                no upstream
              </span>
            )}
            {/* remote selector — only show if multiple remotes */}
            {fetchRemoteNames.length > 1 ? (
              <select
                className="mono"
                aria-label="Remote"
                value={activeFetchRemoteName}
                disabled={busy}
                onChange={(e) => setFetchRemote(e.target.value)}
                style={{
                  padding: '5px 8px',
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
            ) : null}
            <button type="button" className="hp-btn" disabled={busy} onClick={() => void runFetch()}>
              Fetch
            </button>
            <button type="button" className="hp-btn" disabled={busy} onClick={() => void runPull()}>
              Pull
            </button>
            <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void runPush()}>
              Push
            </button>
            {activeFetchProvider !== 'other' && cloudAccounts.some((a) => a.provider === activeFetchProvider) ? (
              <button
                type="button"
                className="hp-btn"
                disabled={busy}
                title={`Create ${activeFetchProvider === 'gitlab' ? 'Merge Request' : 'Pull Request'}`}
                onClick={() => { setLastCreatedPrUrl(null); setPrWizardOpen(true) }}
              >
                <span className="codicon codicon-git-pull-request" style={{ fontSize: 13, marginRight: 4 }} aria-hidden />
                {activeFetchProvider === 'gitlab' ? 'New MR' : 'New PR'}
              </button>
            ) : null}
          </div>

          {lastCreatedPrUrl ? (
            <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="codicon codicon-check" style={{ color: '#69f0ae' }} aria-hidden />
              <a href={lastCreatedPrUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--cg-accent, var(--accent))' }}>
                {activeFetchProvider === 'gitlab' ? 'Merge request' : 'Pull request'} created →
              </a>
              <button type="button" className="hp-btn" style={{ fontSize: 11, padding: '1px 6px' }} onClick={() => setLastCreatedPrUrl(null)}>
                ✕
              </button>
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {softSuccessNotice && (
              <div style={{ padding: '8px 12px', background: 'rgba(105, 240, 174, 0.1)', borderLeft: '3px solid #69f0ae', borderRadius: 4, fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{softSuccessNotice}</span>
                <button type="button" className="hp-btn hp-btn-ghost hp-btn-xs" onClick={() => setSoftSuccessNotice(null)}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                type="button" 
                className="hp-btn hp-btn-primary" 
                onClick={() => setIntegrateWizardOpen(true)}
                disabled={busy}
                style={{ flex: 1 }}
              >
                <span className="codicon codicon-git-merge" style={{ marginRight: 8 }} />
                Integrate / Sync...
              </button>
              {gitOperation !== 'none' && (
                 <>
                   <button 
                     type="button" 
                     className="hp-btn hp-btn-primary" 
                     onClick={() => gitOperation === 'merging' ? runMergeContinue() : runRebaseContinue()}
                     disabled={busy || conflictFileCount > 0}
                   >
                     Continue
                   </button>
                   <button 
                     type="button" 
                     className="hp-btn hp-btn-danger" 
                     onClick={() => gitOperation === 'merging' ? runMergeAbort() : runRebaseAbort()}
                     disabled={busy}
                   >
                     Abort
                   </button>
                 </>
              )}
              <button 
                type="button" 
                className="hp-btn" 
                onClick={() => runStashPop()}
                disabled={busy}
                title="Pop last stash"
              >
                <span className="codicon codicon-archive" />
              </button>
            </div>
          </div>

          <GitVcsRepoPipelines
            repoPath={repoPath.trim()}
            remoteName={activeFetchRemoteName}
            provider={activeFetchPipelineProvider}
            ambiguousHost={ambiguousPipelineHost}
            onAmbiguousTokenChange={setAmbiguousCiToken}
          />

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
            disabled={staged.length === 0 && unstaged.length === 0}
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

      <GitVcsPrWizard
        open={prWizardOpen}
        provider={activeFetchProvider === 'other' ? 'other' : activeFetchProvider}
        repoPath={repoPath.trim()}
        remoteName={activeFetchRemoteName}
        currentBranch={branch}
        branches={branches}
        onClose={() => setPrWizardOpen(false)}
        onCreated={(url) => {
          setLastCreatedPrUrl(url)
          setPrWizardOpen(false)
          if (activeFetchProvider !== 'other') {
            const info = { url, reference: branch, provider: activeFetchProvider }
            setTrackingPr(info)
            const key = `vcs_pr_tracking_${repoPath.trim()}_${branch}`
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            void window.dh.storeSet({ key: key as any, data: info as any })
          }
        }}
      />

      <GitVcsIntegrateWizardModal
        isOpen={integrateWizardOpen}
        repoPath={repoPath.trim()}
        currentBranch={branch}
        suggestedTarget={suggestedIntegrateTarget}
        onClose={() => {
          setIntegrateWizardOpen(false)
          setSuggestedIntegrateTarget('')
        }}
        busy={busy}
        onAction={async (method, targetRef) => {
          setBusy(true)
          setGitOperation(method === 'merge' ? 'merging' : 'rebasing')
          try {
            const res = method === 'merge' 
              ? await window.dh.gitVcsMerge({ repoPath: repoPath.trim(), branch: targetRef, ffOnly: false })
              : await window.dh.gitVcsRebase({ repoPath: repoPath.trim(), onto: targetRef })
            
            if (!res.ok) {
              const isConflict = res.error?.includes('CONFLICT') || 
                                res.error?.includes('unmerged files')
              if (isConflict) {
                setIntegrateWizardOpen(false)
                setConflictWizardOpen(true)
              } else {
                setOpErrorRaw(res.error ?? 'Integration failed')
              }
            } else {
              setIntegrateWizardOpen(false)
              setSoftSuccessNotice(`Successfully ${method}d ${targetRef}`)
            }
          } finally {
            setBusy(false)
            void refreshStatus()
          }
        }}
      />

      <GitVcsConflictWizardModal
        isOpen={conflictWizardOpen}
        repoPath={repoPath.trim()}
        conflictFiles={conflictedFiles}
        onClose={() => setConflictWizardOpen(false)}
        onSuccess={() => {
          setConflictWizardOpen(false)
          void (async () => {
            const lists = await refreshStatus()
            setSelected((prev) => reconcileGitVcsSelection(prev, lists.staged, lists.unstaged))
          })()
        }}
      />
    </div>
  )
}
