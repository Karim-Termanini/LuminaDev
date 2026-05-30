import type { BranchEntry, ConnectedAccount, FileEntry, GitRepoEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { invoke } from '@tauri-apps/api/core'

import { openRepoInEditor } from './gitAssistantEditor'
import { GIT_ASSISTANT_FOOTER } from './constants'
import { GitAssistantSection } from './GitAssistantSection'
import './GitAssistantPage.css'
import { GitBranchBar } from './GitBranchBar'
import { GitChangesPanel } from './GitChangesPanel'
import { GitNextStepCard } from './GitNextStepCard'
import { GitProgressRail } from './GitProgressRail'
import { GitProjectBar } from './GitProjectBar'
import { GitBehindRemoteModal } from './GitBehindRemoteModal'
import { GitRemoteUpdatesBanner } from './GitRemoteUpdatesBanner'
import { GitSaveShareBar } from './GitSaveShareBar'
import { GitSetupChecklist } from './GitSetupChecklist'
import { GitPostPushBanner } from './GitPostPushBanner'
import { GitShareOnlinePanel } from './GitShareOnlinePanel'
import { assertGitOk } from '../gitContract'
import { humanizeGitError, parseGitErrorCode } from '../gitError'
import { assertGitVcsOk } from '../gitVcsContract'
import { humanizeGitVcsError, parseGitVcsErrorCode } from '../gitVcsError'
import { parseCheckoutDirtyFileList } from '../gitVcsCheckoutDirty'
import { GitVcsDirtyCheckoutModal } from '../GitVcsDirtyCheckoutModal'
import { cloudProviderLabel, hasCloudGitConnected, preferredCloudProvider } from '../gitAssistantCloud'
import { branchWebUrl, hostRepoWebLink } from '../gitAssistantRemoteUrl'
import { computeGitAssistantNextAction } from '../gitAssistantNextAction'
import {
  buildIncludedFromPaths,
  setPathIncluded,
  type BranchExclusionMap,
} from '../gitAssistantFileInclusion'
import { isDevAppSourceRepo } from '../gitAssistantDevRepo'
import { fetchOriginQuiet } from '../gitAssistantRemoteSync'
import { computeGitProgressRail } from '../gitAssistantProgressRail'
import type { GitProgressStep } from '../gitAssistantProgressRail'
import { evaluateGitSetupChecklist, isGitSetupComplete } from '../gitAssistantSetup'
import type { GitProviderFamily } from '../gitVcsProviderHost'
import { classifyGitRemoteUrl } from '../gitVcsProviderHost'
import { assertGitRecentList } from '../registryContract'
import { settingsAccountsHref } from '../settingsAccountsHref'
import type { GitVcsOperation } from '../gitVcsTypes'

type DirtyCheckoutPrompt = { branch: string; create: boolean; files: string[] }

type GitCloneResponse = { ok: boolean; error?: string; path?: string }

function humanizeGitOpMessage(raw: string): string {
  if (/\[GIT_VCS_/.test(raw)) return humanizeGitVcsError(raw)
  return humanizeGitError(raw)
}

export function GitAssistantPage(): ReactElement {
  const { t } = useTranslation('git')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const setupRef = useRef<HTMLElement>(null)
  const projectRef = useRef<HTMLElement>(null)
  const saveRef = useRef<HTMLElement>(null)
  const shareRef = useRef<HTMLElement>(null)

  const [recents, setRecents] = useState<GitRepoEntry[]>([])
  const [repoPath, setRepoPath] = useState('')
  const [branch, setBranch] = useState('')
  const [ahead, setAhead] = useState<number | null>(null)
  const [behind, setBehind] = useState<number | null>(null)
  const [staged, setStaged] = useState<FileEntry[]>([])
  const [unstaged, setUnstaged] = useState<FileEntry[]>([])
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [opErrorRaw, setOpErrorRaw] = useState<string | null>(null)
  const [cloudAccounts, setCloudAccounts] = useState<ConnectedAccount[]>([])
  const [gitOperation, setGitOperation] = useState<GitVcsOperation>('none')
  const [conflictFileCount, setConflictFileCount] = useState(0)
  const [setupItems, setSetupItems] = useState(evaluateGitSetupChecklist(new Map(), false))
  const [identityOpen, setIdentityOpen] = useState(false)
  const [identityName, setIdentityName] = useState('')
  const [identityEmail, setIdentityEmail] = useState('')
  const [branches, setBranches] = useState<BranchEntry[]>([])
  const [dirtyCheckout, setDirtyCheckout] = useState<DirtyCheckoutPrompt | null>(null)
  const [stashIncludeUntracked, setStashIncludeUntracked] = useState(true)
  const [editorRefreshHint, setEditorRefreshHint] = useState(false)
  const [behindModalCount, setBehindModalCount] = useState<number | null>(null)
  const [postPush, setPostPush] = useState<{ host: string; branchUrl: string } | null>(null)
  const [remoteHost, setRemoteHost] = useState<GitProviderFamily | null>(null)
  const statusTargetRef = useRef('')
  const excludedByBranchRef = useRef<BranchExclusionMap>(new Map())
  const [unborn, setUnborn] = useState(false)

  const cloudConnected = useMemo(() => hasCloudGitConnected(cloudAccounts), [cloudAccounts])

  const connectProvider = useMemo(
    () => preferredCloudProvider(cloudAccounts, remoteHost),
    [cloudAccounts, remoteHost],
  )

  const connectAccountsHref = settingsAccountsHref(connectProvider ?? 'github')

  const opIsCloneInfo = opErrorRaw?.startsWith('[GIT_CLONE_ALREADY_HERE]') ?? false
  const opError = opErrorRaw && !opIsCloneInfo ? humanizeGitOpMessage(opErrorRaw) : null
  const opInfo = opIsCloneInfo ? humanizeGitError(opErrorRaw) : null

  const loadSetup = useCallback(async () => {
    try {
      const res = await window.dh.gitConfigList({ target: 'host' })
      assertGitOk(res, 'Failed to load Git config.')
      const rows = res.rows ?? []
      const cfg = new Map(rows.map((r) => [r.key.toLowerCase(), r.value]))
      setSetupItems(evaluateGitSetupChecklist(cfg, cloudConnected))
      setIdentityName(cfg.get('user.name') ?? '')
      setIdentityEmail(cfg.get('user.email') ?? '')
    } catch {
      setSetupItems(evaluateGitSetupChecklist(new Map(), cloudConnected))
    }
  }, [cloudConnected])

  const cloudLoadEpochRef = useRef(0)

  useEffect(() => {
    const epoch = ++cloudLoadEpochRef.current
    void window.dh.cloudAuthStatus().then((res) => {
      if (epoch !== cloudLoadEpochRef.current) return
      if (res.ok && Array.isArray(res.accounts)) setCloudAccounts(res.accounts as ConnectedAccount[])
      else setCloudAccounts([])
    })
    return () => {
      cloudLoadEpochRef.current++
    }
  }, [])

  useEffect(() => {
    void loadSetup()
  }, [loadSetup, cloudAccounts])

  useEffect(() => {
    setPostPush(null)
  }, [repoPath])

  const loadRecents = useCallback(async () => {
    try {
      const res = await window.dh.gitRecentList()
      setRecents(assertGitRecentList(res))
    } catch {
      setRecents([])
    }
  }, [])

  useEffect(() => {
    void loadRecents()
  }, [loadRecents])

  const persistRepoChoice = useCallback(
    async (next: string): Promise<void> => {
      excludedByBranchRef.current = new Map()
      setRepoPath(next)
      setOpErrorRaw(null)
      if (!next.trim()) return
      try {
        const add = await window.dh.gitRecentAdd({ path: next.trim() })
        assertGitOk(add, 'Could not add repo to recents.')
        await loadRecents()
      } catch {
        /* best-effort */
      }
    },
    [loadRecents],
  )

  useEffect(() => {
    if (repoPath) return
    if (recents.length === 0) return
    const top = [...recents].sort((a, b) => b.lastOpened - a.lastOpened)[0]
    if (top?.path) setRepoPath(top.path)
  }, [recents, repoPath])

  useEffect(() => {
    const qRepo = searchParams.get('repoPath')?.trim()
    if (!qRepo || qRepo === repoPath.trim()) return
    void persistRepoChoice(qRepo)
    const next = new URLSearchParams(searchParams)
    next.delete('repoPath')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, repoPath, persistRepoChoice])

  const refreshStatus = useCallback(async (options?: { fetchRemote?: boolean }) => {
    const path = repoPath.trim()
    statusTargetRef.current = path
    if (!path) {
      setBranch('')
      setAhead(null)
      setBehind(null)
      setStaged([])
      setUnstaged([])
      setGitOperation('none')
      setConflictFileCount(0)
      setIncluded(new Set())
      setBranches([])
      setRemoteHost(null)
      setUnborn(false)
      excludedByBranchRef.current = new Map()
      return
    }
    if (options?.fetchRemote) {
      await fetchOriginQuiet(path)
      if (statusTargetRef.current !== path) return
    }
    const [st, br] = await Promise.all([
      window.dh.gitVcsStatus({ repoPath: path }),
      window.dh.gitVcsBranches({ repoPath: path }),
    ])
    if (statusTargetRef.current !== path) return
    assertGitVcsOk(st)
    assertGitVcsOk(br)
    setBranches(Array.isArray(br.branches) ? (br.branches as BranchEntry[]) : [])
    setBranch(st.branch ?? '')
    setUnborn(Boolean((st as { unborn?: unknown }).unborn))
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
    const paths = [
      ...new Set([
        ...unstagedArr.filter((f) => f.status !== 'C').map((f) => f.path),
        ...stagedArr.filter((f) => f.status !== 'C').map((f) => f.path),
      ]),
    ]
    const branchKey = (st.branch ?? '').trim()
    setIncluded(buildIncludedFromPaths(paths, branchKey, excludedByBranchRef.current))
    try {
      const rem = await window.dh.gitVcsRemotes({ repoPath: path })
      if (statusTargetRef.current !== path) return
      assertGitVcsOk(rem)
      const origin = (rem.remotes ?? []).find((r) => r.name === 'origin') ?? rem.remotes?.[0]
      setRemoteHost(origin?.fetchUrl ? classifyGitRemoteUrl(origin.fetchUrl) : null)
    } catch {
      if (statusTargetRef.current === path) setRemoteHost(null)
    }
  }, [repoPath])

  useEffect(() => {
    const path = repoPath.trim()
    statusTargetRef.current = path
    if (!path) {
      setBranch('')
      setAhead(null)
      setBehind(null)
      setStaged([])
      setUnstaged([])
      setGitOperation('none')
      setConflictFileCount(0)
      setIncluded(new Set())
      setBranches([])
      setRemoteHost(null)
      setUnborn(false)
      excludedByBranchRef.current = new Map()
      return
    }
    let alive = true
    setBusy(true)
    setOpErrorRaw(null)
    void refreshStatus({ fetchRemote: true })
      .catch((e) => {
        if (alive && statusTargetRef.current === path) {
          setOpErrorRaw(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (alive && statusTargetRef.current === path) setBusy(false)
      })
    return () => {
      alive = false
      statusTargetRef.current = ''
    }
  }, [repoPath, refreshStatus])

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || !repoPath.trim()) return
      void refreshStatus({ fetchRemote: true })
        .then(() => {
          if (conflictFileCount > 0 || gitOperation !== 'none') {
            setEditorRefreshHint(true)
            window.setTimeout(() => setEditorRefreshHint(false), 4000)
          }
        })
        .catch(() => {
          /* ignore */
        })
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [repoPath, refreshStatus, conflictFileCount, gitOperation])

  const setupComplete = isGitSetupComplete(setupItems)
  const projectComplete = !!repoPath.trim() && (!!branch || unborn)
  const hasLocalChanges = staged.length > 0 || unstaged.length > 0
  const saveComplete = !!repoPath.trim() && !hasLocalChanges
  const rail = computeGitProgressRail({
    setupComplete,
    projectComplete,
    saveComplete,
    cloudConnected,
    ahead,
  })

  const next = computeGitAssistantNextAction({
    cloudConnected,
    repoPathTrimmed: repoPath.trim(),
    gitOperation,
    conflictFileCount,
    stagedCount: staged.length,
    unstagedCount: unstaged.length,
    ahead,
    behind,
    commitMessageTrimmed: commitMessage,
  })

  const scrollToStep = (step: GitProgressStep): void => {
    const map: Record<GitProgressStep, React.RefObject<HTMLElement | null>> = {
      setup: setupRef,
      project: projectRef,
      save: saveRef,
      share: shareRef,
    }
    map[step].current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const openFolder = async (): Promise<void> => {
    const dir = await window.dh.selectFolder()
    if (!dir) return
    await persistRepoChoice(dir)
  }

  const runClone = async (url: string, targetDir: string): Promise<void> => {
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const res = (await window.dh.gitClone({ url, targetDir })) as GitCloneResponse
      if (!res.ok) {
        const code = res.error ? parseGitErrorCode(new Error(res.error)) : null
        if (code === 'GIT_CLONE_EXISTS' && res.path?.trim()) {
          await persistRepoChoice(res.path.trim())
          setOpErrorRaw(`[GIT_CLONE_ALREADY_HERE] ${t('assistant.clone.openedExisting')}`)
          return
        }
        assertGitOk(res, 'Clone failed.')
      }
      const clonedPath = res.path?.trim()
      if (clonedPath) await persistRepoChoice(clonedPath)
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const openInEditor = async (): Promise<void> => {
    if (!repoPath.trim()) return
    await openRepoInEditor(repoPath.trim())
  }

  const runCheckout = async (name: string, create: boolean): Promise<void> => {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsCheckout({ repoPath: repoPath.trim(), branch: name, create })
      assertGitVcsOk(r)
      setDirtyCheckout(null)
      await refreshStatus({ fetchRemote: true })
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      if (parseGitVcsErrorCode(new Error(raw)) === 'GIT_VCS_CHECKOUT_DIRTY') {
        setDirtyCheckout({ branch: name, create, files: parseCheckoutDirtyFileList(raw) })
      } else {
        setOpErrorRaw(raw)
      }
    } finally {
      setBusy(false)
    }
  }

  const runStashAndSwitch = async (): Promise<void> => {
    const prompt = dirtyCheckout
    if (!prompt || !repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const path = repoPath.trim()
      const stashRes = await window.dh.gitVcsStash({
        repoPath: path,
        message: `LuminaDev: before ${prompt.create ? 'create' : 'switch'} ${prompt.branch}`,
        includeUntracked: stashIncludeUntracked,
      })
      assertGitVcsOk(stashRes)
      const checkoutRes = await window.dh.gitVcsCheckout({
        repoPath: path,
        branch: prompt.branch,
        create: prompt.create,
      })
      assertGitVcsOk(checkoutRes)
      setDirtyCheckout(null)
      await refreshStatus({ fetchRemote: true })
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runPrimary = async (): Promise<void> => {
    if (!next) return
    if (next === 'connect_cloud') {
      void navigate(connectAccountsHref)
      return
    }
    if (next === 'open_project') {
      await openFolder()
      return
    }
    if (next === 'open_editor') {
      await openInEditor()
      return
    }
    if (next === 'continue_merge') {
      await runContinueMerge()
      return
    }
    if (next === 'pull') {
      await runPull()
      return
    }
    if (next === 'commit' || next === 'commit_message') {
      await runSaveSnapshot(commitMessage)
      return
    }
    if (next === 'push') {
      await runPush()
    }
  }

  const runSaveSnapshot = async (liveMessage: string): Promise<void> => {
    if (!repoPath.trim()) return
    const message = liveMessage.trim()
    if (!message) {
      setOpErrorRaw('[GIT_VCS_EMPTY_MESSAGE] Commit message cannot be empty.')
      return
    }
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const path = repoPath.trim()
      const paths = [...included]
      if (paths.length > 0) {
        const rStage = await window.dh.gitVcsStage({ repoPath: path, filePaths: paths })
        assertGitVcsOk(rStage)
      } else {
        const rStage = await window.dh.gitVcsStage({ repoPath: path, filePaths: [], stageAll: true })
        assertGitVcsOk(rStage)
      }
      const r = await window.dh.gitVcsCommit({ repoPath: path, message })
      assertGitVcsOk(r)
      setCommitMessage('')
      await refreshStatus()
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
      try {
        await refreshStatus()
      } catch {
        /* ignore */
      }
    } finally {
      setBusy(false)
    }
  }

  const runPull = async (): Promise<void> => {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const r = await window.dh.gitVcsPull({ repoPath: repoPath.trim() })
      assertGitVcsOk(r)
      await refreshStatus()
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const resolveBranchWebUrl = useCallback(async (): Promise<{ host: string; branchUrl: string } | null> => {
    const path = repoPath.trim()
    const branchName = branch.trim()
    if (!path || !branchName) return null
    try {
      const rem = await window.dh.gitVcsRemotes({ repoPath: path })
      assertGitVcsOk(rem)
      const origin = (rem.remotes ?? []).find((r) => r.name === 'origin') ?? rem.remotes?.[0]
      if (!origin?.fetchUrl) return null
      const link = hostRepoWebLink(origin.fetchUrl)
      if (!link) return null
      return {
        host: cloudProviderLabel(link.provider),
        branchUrl: branchWebUrl(link, branchName),
      }
    } catch {
      return null
    }
  }, [repoPath, branch])

  const runPush = async (): Promise<void> => {
    if (!repoPath.trim()) return
    const path = repoPath.trim()
    setBusy(true)
    setOpErrorRaw(null)
    setPostPush(null)
    try {
      await fetchOriginQuiet(path)
      const st = await window.dh.gitVcsStatus({ repoPath: path })
      assertGitVcsOk(st)
      if (st.behind != null && st.behind > 0) {
        setBehindModalCount(st.behind)
        setOpErrorRaw(
          `[GIT_VCS_INTEGRATION_REQUIRED] Remote has ${st.behind} commit(s) not in your branch yet.`,
        )
        await refreshStatus()
        return
      }
      const r = await window.dh.gitVcsPush({ repoPath: path, remote: 'origin', branch: branch || undefined })
      assertGitVcsOk(r)
      await refreshStatus()
      const link = await resolveBranchWebUrl()
      if (link) setPostPush(link)
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runContinueMerge = async (): Promise<void> => {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const channel =
        gitOperation === 'rebasing' ? 'dh:git:vcs:rebase-continue' : 'dh:git:vcs:merge-continue'
      const r = (await invoke('ipc_invoke', {
        channel,
        payload: { repoPath: repoPath.trim() },
      })) as { ok?: boolean; error?: string }
      if (!r.ok) throw new Error(r.error ?? 'Continue failed.')
      await refreshStatus()
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const runAbortMerge = async (): Promise<void> => {
    if (!repoPath.trim()) return
    setBusy(true)
    setOpErrorRaw(null)
    try {
      const channel = gitOperation === 'rebasing' ? 'dh:git:vcs:rebase-abort' : 'dh:git:vcs:merge-abort'
      const r = (await invoke('ipc_invoke', {
        channel,
        payload: { repoPath: repoPath.trim() },
      })) as { ok?: boolean; error?: string }
      if (!r.ok) throw new Error(r.error ?? 'Abort failed.')
      await refreshStatus()
    } catch (e) {
      setOpErrorRaw(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const saveIdentity = async (): Promise<void> => {
    setBusy(true)
    try {
      if (identityName.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.name', value: identityName.trim() })
      }
      if (identityEmail.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.email', value: identityEmail.trim() })
      }
      setIdentityOpen(false)
      await loadSetup()
    } finally {
      setBusy(false)
    }
  }

  const setCredentialHelper = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.dh.gitConfigSetKey({ key: 'credential.helper', value: 'cache --timeout=3600' })
      await loadSetup()
    } finally {
      setBusy(false)
    }
  }

  const setDefaultBranchMain = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.dh.gitConfigSetKey({ key: 'init.defaultBranch', value: 'main' })
      await loadSetup()
    } finally {
      setBusy(false)
    }
  }

  const showPull = !!repoPath.trim() && behind != null && behind > 0
  const showPush =
    !!repoPath.trim() &&
    !hasLocalChanges &&
    ahead != null &&
    ahead > 0 &&
    conflictFileCount === 0 &&
    gitOperation === 'none'

  return (
    <div className="git-assistant-page elevated-page">
      <GitProgressRail rail={rail} onStepClick={scrollToStep} />
      <div className="git-assistant-scroll">
        <header className="git-assistant-hero">
          <div className="git-assistant-hero-eyebrow">
            <span className="codicon codicon-source-control" aria-hidden />
            {t('assistant.page.eyebrow')}
          </div>
          <h1 className="git-assistant-hero-title">{t('assistant.page.title')}</h1>
          <p className="git-assistant-hero-sub">{t('assistant.page.subtitle')}</p>
        </header>

        <div className="git-assistant-stack">
          <GitNextStepCard next={next} busy={busy} onPrimary={() => void runPrimary()} />

          {editorRefreshHint ? (
            <div className="hp-status-alert success" role="status">
              <span className="codicon codicon-sync" aria-hidden />
              {t('assistant.editorRefresh')}
            </div>
          ) : null}

          {opInfo ? (
            <div className="hp-status-alert success" role="status">
              <span className="codicon codicon-check" aria-hidden />
              {opInfo}
            </div>
          ) : null}

          {opError ? (
            <div className="hp-status-alert error" role="alert">
              <span className="codicon codicon-error" aria-hidden />
              {opError}
            </div>
          ) : null}

          {(gitOperation === 'merging' || gitOperation === 'rebasing') && conflictFileCount === 0 ? (
            <GitAssistantSection
              id="git-merge-heading"
              title={t('assistant.merge.title')}
              subtitle={t('assistant.merge.subtitle')}
              icon="git-merge"
              className="git-assistant-merge-banner"
            >
              <p className="hp-muted" style={{ margin: '0 0 12px' }}>
                {t('assistant.mergeInProgress')}
              </p>
              <div className="hp-row-wrap">
                <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void runContinueMerge()}>
                  <span className="codicon codicon-debug-continue" aria-hidden />
                  {t('assistant.mergeContinue')}
                </button>
                <button type="button" className="hp-btn hp-btn-danger" disabled={busy} onClick={() => void runAbortMerge()}>
                  {t('assistant.mergeAbort')}
                </button>
              </div>
            </GitAssistantSection>
          ) : null}

          <div className="git-assistant-duo-grid">
            <div ref={setupRef as React.RefObject<HTMLDivElement>} className="git-assistant-duo-cell">
              <GitSetupChecklist
                items={setupItems}
                connectAccountsHref={connectAccountsHref}
                busy={busy}
                onSetIdentity={() => setIdentityOpen(true)}
                onSetCredentialHelper={() => void setCredentialHelper()}
                onSetDefaultBranch={() => void setDefaultBranchMain()}
                onSetConfigKey={async (key, value) => {
                  await window.dh.gitConfigSetKey({ key, value })
                }}
                onReloadSetup={loadSetup}
              />
              {identityOpen ? (
                <div className="git-assistant-inline-panel">
                  <div className="git-assistant-inline-form">
                    <input
                      className="hp-input"
                      value={identityName}
                      onChange={(e) => setIdentityName(e.target.value)}
                      placeholder={t('assistant.setup.namePlaceholder')}
                    />
                    <input
                      className="hp-input"
                      value={identityEmail}
                      onChange={(e) => setIdentityEmail(e.target.value)}
                      placeholder={t('assistant.setup.emailPlaceholder')}
                    />
                    <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void saveIdentity()}>
                      {t('assistant.setup.saveIdentity')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={projectRef as React.RefObject<HTMLDivElement>} className="git-assistant-duo-cell">
              <GitProjectBar
                repoPath={repoPath}
                branch={branch}
                recents={recents}
                busy={busy}
                onSelectRepo={(p) => void persistRepoChoice(p)}
                onOpenFolder={() => void openFolder()}
                onClone={runClone}
              />
            </div>
          </div>

          {repoPath.trim() ? (
            <>
              {isDevAppSourceRepo(repoPath) ? (
                <div className="hp-status-alert warning" role="status" style={{ marginBottom: 12 }}>
                  {t('assistant.devRepoWarning')}
                </div>
              ) : null}
              {unborn ? (
                <p className="hp-muted git-assistant-unborn-hint" role="status">
                  {t('assistant.project.unborn')}
                </p>
              ) : null}
              <GitBranchBar
                branches={branches}
                currentBranch={branch || t('assistant.branch.unborn')}
                busy={busy}
                onCheckout={(name) => void runCheckout(name, false)}
                onCreateBranch={(name) => void runCheckout(name, true)}
              />
              <GitVcsDirtyCheckoutModal
                open={dirtyCheckout != null}
                targetBranch={dirtyCheckout?.branch ?? ''}
                creatingNewBranch={dirtyCheckout?.create ?? false}
                files={dirtyCheckout?.files ?? []}
                includeUntracked={stashIncludeUntracked}
                onIncludeUntrackedChange={setStashIncludeUntracked}
                busy={busy}
                onCancel={() => setDirtyCheckout(null)}
                onStashAndSwitch={() => void runStashAndSwitch()}
              />
              <div ref={saveRef as React.RefObject<HTMLDivElement>} className="git-assistant-save-grid">
                <div className="git-assistant-save-main">
                  {showPull ? (
                    <GitRemoteUpdatesBanner
                      behind={behind ?? 0}
                      busy={busy}
                      onGetLatest={() => void runPull()}
                    />
                  ) : null}
                  <GitSaveShareBar
                    message={commitMessage}
                    onMessageChange={setCommitMessage}
                    busy={busy}
                    disabled={!repoPath.trim()}
                    next={next}
                    showPull={showPull}
                    showPush={showPush}
                    onSaveSnapshot={(m) => void runSaveSnapshot(m)}
                    onGetLatest={() => void runPull()}
                    onSend={() => void runPush()}
                  />
                  {postPush ? (
                    <GitPostPushBanner
                      host={postPush.host}
                      branchUrl={postPush.branchUrl}
                      busy={busy}
                      onDismiss={() => setPostPush(null)}
                    />
                  ) : null}
                  <div ref={shareRef as React.RefObject<HTMLDivElement>}>
                    {!cloudConnected ? (
                      <GitAssistantSection
                        id="git-share-heading"
                        title={t('assistant.share.title')}
                        subtitle={t('assistant.share.subtitle')}
                        icon="github"
                      >
                        <p className="hp-muted" style={{ margin: 0 }}>
                          {t('assistant.cloud.prompt')}
                        </p>
                        <Link
                          to={connectAccountsHref}
                          className="hp-btn hp-btn-primary"
                          style={{ marginTop: 12, textDecoration: 'none', width: 'fit-content' }}
                        >
                          <span className="codicon codicon-link" aria-hidden />
                          {t('assistant.setup.fixConnect')}
                        </Link>
                      </GitAssistantSection>
                    ) : (
                      <GitShareOnlinePanel
                        repoPath={repoPath}
                        branch={branch}
                        branchNames={branches.map((b) => b.name).filter(Boolean)}
                        cloudProvider={connectProvider}
                        cloudConnected={cloudConnected}
                        ahead={ahead}
                        behind={behind}
                        busy={busy}
                        suggestedPrTitle={commitMessage.trim() || branch}
                      />
                    )}
                  </div>
                </div>
                <div className="git-assistant-save-changes">
                  <GitChangesPanel
                    repoPath={repoPath}
                    staged={staged}
                    unstaged={unstaged}
                    included={included}
                    busy={busy}
                    onToggle={(path, on) => {
                      setPathIncluded(excludedByBranchRef.current, branch, path, on)
                      setIncluded(
                        buildIncludedFromPaths(
                          [
                            ...unstaged.filter((f) => f.status !== 'C').map((f) => f.path),
                            ...staged.filter((f) => f.status !== 'C').map((f) => f.path),
                          ],
                          branch,
                          excludedByBranchRef.current,
                        ),
                      )
                    }}
                    onToggleAll={(paths, on) => {
                      setIncluded((prev) => {
                        const nextSet = new Set(prev)
                        for (const p of paths) {
                          if (on) nextSet.add(p)
                          else nextSet.delete(p)
                        }
                        return nextSet
                      })
                    }}
                  />
                </div>
              </div>
              <GitBehindRemoteModal
                open={behindModalCount != null && behindModalCount > 0}
                behind={behindModalCount ?? 0}
                busy={busy}
                onPull={() => {
                  setBehindModalCount(null)
                  void runPull()
                }}
                onDismiss={() => setBehindModalCount(null)}
              />
            </>
          ) : null}

          <footer className="git-assistant-footer">
            <p>{GIT_ASSISTANT_FOOTER}</p>
          </footer>
        </div>
      </div>
    </div>
  )
}
